// Focus-timer hook. Owns every piece of state and side-effect for the
// pomodoro dial:
//   - dial state (running/paused, current seconds, target minutes, durations)
//   - which task is linked (goalId + taskId)
//   - the 1-second tick interval
//   - end-of-session bookkeeping (focusLog entry, task counters, chime)
//   - early-end + reset semantics
//   - pom-duration persistence + restoration from settings
//
// The hook is deliberately UI-agnostic. The consumer passes an optional
// onSessionStart callback for things like "switch to the focus tab" when
// a session starts — that lives outside the timer's concern.
//
// ── Wall-clock timing ──────────────────────────────────────────────────
// Time is tracked from the system clock, NOT by decrementing a counter
// in setInterval. Browsers throttle background-tab intervals (mobile
// Safari freezes them entirely when the screen locks), so the old
// "subtract 1 per tick" approach silently undercounted long sessions
// and credited the *target* minutes to focusLog regardless of actual
// elapsed time. With wall-clock math:
//   - startedAtRef     timestamp of the current run (null when paused)
//   - accumulatedSecRef seconds already banked from prior runs of THIS session
//   - targetSecRef     total target seconds for the session
//   - elapsed = accumulated + (running ? Date.now() - startedAt : 0)
// The tick interval is now purely a re-render trigger; the math is what
// matters. visibilitychange also forces an immediate sync so a session
// that completed while backgrounded fires its completion the moment the
// user returns.

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DURATIONS } from "../lib/constants";
import { newId } from "../lib/ids";
import { localDateStr } from "../lib/dates";
import { getFocusSeconds } from "../lib/focus";
import { getAudioCtx, playTimerSound } from "../lib/audio";
import { haptic } from "../lib/feedback";

const FOCUS_LOG_CAP = 100;

export function useFocusTimer({
  goals,
  applyGoalsUpdate,
  applyFocusLogUpdate,
  settingsFromDb,
  userSettings,
  updateSettings,
  onSessionStart,
}) {
  const [pomDurations, setPomDurations] = useState(DEFAULT_DURATIONS);
  const [pomSeconds, setPomSeconds] = useState(() => getFocusSeconds(null, DEFAULT_DURATIONS));
  const [pomRunning, setPomRunningInternal] = useState(false);
  const [pomTaskId, setPomTaskId] = useState(null);
  const [pomGoalId, setPomGoalId] = useState(null);
  const [pomFocusTargetMins, setPomFocusTargetMins] = useState(DEFAULT_DURATIONS.defaultFocus);
  // The most-recent finished session, used to render the celebration banner
  // on the Focus tab. Clears when a new session starts or the user dismisses.
  // Shape: { id, taskId, goalId, mins, completedAt, kind: "complete" | "early" }
  // `id` matches the focusLog entry so the consumer can patch its `note`
  // field from the post-session "What moved forward?" prompt.
  const [lastSession, setLastSession] = useState(null);
  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);
  const accumulatedSecRef = useRef(0);
  const targetSecRef = useRef(getFocusSeconds(null, DEFAULT_DURATIONS));
  const settingsAppliedRef = useRef(false);

  // Restore pom durations + dial defaults from settings on first load.
  useEffect(() => {
    if (settingsAppliedRef.current || !settingsFromDb?.pomDurations) return;
    settingsAppliedRef.current = true;
    setPomDurations(settingsFromDb.pomDurations);
    const startSecs = getFocusSeconds(null, settingsFromDb.pomDurations);
    setPomSeconds(startSecs);
    targetSecRef.current = startSecs;
    setPomFocusTargetMins(settingsFromDb.pomDurations.defaultFocus || DEFAULT_DURATIONS.defaultFocus);
  }, [settingsFromDb]);

  // Current elapsed seconds for the active session, summed across runs.
  // Safe to call when paused (returns just the banked accumulation) or
  // idle (returns 0). Reads from refs so it doesn't pin a stale value.
  function currentElapsedSec() {
    const fromActive = startedAtRef.current != null ? (Date.now() - startedAtRef.current) / 1000 : 0;
    return accumulatedSecRef.current + fromActive;
  }

  // Setter wrapper so refs stay in sync with the running flag. Every
  // running→paused transition banks the active run into accumulated; every
  // paused→running transition snapshots the resume timestamp. Without
  // this, a pause would lose all elapsed time and a resume would treat
  // every session as fresh. Returned as `setPomRunning` so consumers
  // call it transparently.
  const setPomRunning = useCallback((next) => {
    setPomRunningInternal((prev) => {
      if (next === prev) return prev;
      if (next) {
        startedAtRef.current = Date.now();
      } else if (startedAtRef.current != null) {
        accumulatedSecRef.current += (Date.now() - startedAtRef.current) / 1000;
        startedAtRef.current = null;
      }
      return next;
    });
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    setPomRunning(false);
  }, [setPomRunning]);

  // Session-complete bookkeeping. Pulled into its own callback because
  // both the tick AND the visibility-resync path can trigger completion
  // — if the user backgrounded a 25-min session and returns 30 min
  // later, completion fires on visibility, not on a tick that never ran.
  const completeSession = useCallback(() => {
    const target = targetSecRef.current;
    if (target <= 0) return;
    // Credit at most the target — backgrounded sessions can run past
    // target by minutes, but the user reserved exactly `target` for this
    // task. Don't inflate focusLog totals.
    const mins = Math.max(1, Math.round(target / 60));
    const at = new Date();
    const entry = {
      id: newId(),
      taskId: pomTaskId,
      goalId: pomGoalId,
      mins,
      at: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      day: localDateStr(at),
    };
    applyFocusLogUpdate((l) => [entry, ...l].slice(0, FOCUS_LOG_CAP));
    if (pomGoalId && pomTaskId) {
      applyGoalsUpdate((gs) => gs.map((g) =>
        g.id !== pomGoalId ? g : {
          ...g,
          tasks: g.tasks.map((t) =>
            t.id !== pomTaskId ? t : { ...t, sessions: (t.sessions || 0) + 1, totalTime: (t.totalTime || 0) + mins }
          ),
        }
      ));
    }
    setLastSession({ id: entry.id, taskId: pomTaskId, goalId: pomGoalId, mins, completedAt: at.toISOString(), kind: "complete" });
    playTimerSound("focusEnd");
    haptic([0, 30, 40, 30]);   // celebratory buzz on mobile, matching the reward system
    accumulatedSecRef.current = 0;
    startedAtRef.current = null;
    const task = pomGoalId && pomTaskId
      ? goals.find((g) => g.id === pomGoalId)?.tasks.find((t) => t.id === pomTaskId)
      : null;
    const nextMins = task?.eta || pomDurations.defaultFocus;
    setPomFocusTargetMins(nextMins);
    const nextSecs = getFocusSeconds(nextMins, pomDurations);
    targetSecRef.current = nextSecs;
    setPomSeconds(nextSecs);
    setPomRunningInternal(false);
  }, [pomGoalId, pomTaskId, goals, pomDurations, applyFocusLogUpdate, applyGoalsUpdate]);

  // Sync the displayed pomSeconds from wall-clock. If we've crossed the
  // target, complete. Cheap; safe to call from the tick AND from a
  // visibility-change event.
  const syncFromClock = useCallback(() => {
    const target = targetSecRef.current;
    const elapsed = currentElapsedSec();
    const remainingSec = target - elapsed;
    if (remainingSec <= 0) {
      completeSession();
      return;
    }
    setPomSeconds(Math.ceil(remainingSec));
  }, [completeSession]);

  // Tick — fires every 1s while running. The math lives in syncFromClock;
  // the interval just keeps the display fresh while the tab is foreground.
  // When backgrounded, the interval may pause; visibility-change handler
  // below catches up on return.
  useEffect(() => {
    if (!pomRunning) {
      clearInterval(intervalRef.current);
      return;
    }
    syncFromClock();
    intervalRef.current = setInterval(syncFromClock, 1000);
    return () => clearInterval(intervalRef.current);
  }, [pomRunning, syncFromClock]);

  // Re-sync the instant the tab becomes visible again — for the case
  // where the timer should have ended while backgrounded.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && pomRunning) syncFromClock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pomRunning, syncFromClock]);

  // Link a task and start. If the same task is already running, this acts
  // as a toggle (stop). Pre-warms the AudioContext under the click so the
  // end-of-session chime can fire even if the tab loses focus later.
  const startTaskTimer = useCallback((goalId, taskId) => {
    if (pomRunning && pomTaskId === taskId) { stopTimer(); return; }
    const task = goals.find((g) => g.id === goalId)?.tasks.find((t) => t.id === taskId);
    const focusMins = task?.eta || pomDurations.defaultFocus;
    getAudioCtx();
    stopTimer();
    setPomGoalId(goalId);
    setPomTaskId(taskId);
    setPomFocusTargetMins(focusMins);
    const startSecs = getFocusSeconds(focusMins, pomDurations);
    setPomSeconds(startSecs);
    targetSecRef.current = startSecs;
    accumulatedSecRef.current = 0;
    startedAtRef.current = null;     // setPomRunning below will set it
    setLastSession(null); // a new session begins — close the previous celebration
    setPomRunning(true);
    if (onSessionStart) onSessionStart();
  }, [pomRunning, pomTaskId, goals, pomDurations, stopTimer, setPomRunning, onSessionStart]);

  const dismissLastSession = useCallback(() => setLastSession(null), []);

  // Patch the `note` field on the most-recently-completed session's
  // focusLog entry. Used by the "What moved forward?" prompt on the
  // celebration banner. Empty strings are stored as undefined so the
  // entry stays clean when the user backspaces everything out.
  const updateLastSessionNote = useCallback((text) => {
    if (!lastSession?.id) return;
    const trimmed = (text || "").trim();
    applyFocusLogUpdate((log) =>
      log.map((l) => l.id !== lastSession.id ? l : (trimmed ? { ...l, note: trimmed } : (() => {
        const { note: _drop, ...rest } = l;
        return rest;
      })())),
    );
  }, [lastSession, applyFocusLogUpdate]);

  // Dual behaviour:
  //  - If a task is linked, delink it but preserve remaining minutes as a
  //    fresh general focus block — abort the task without losing the
  //    time you'd set aside.
  //  - No task linked: just reset to default focus length.
  const resetTimer = useCallback(() => {
    stopTimer();
    if (pomTaskId) {
      const remainingMins = Math.max(1, Math.ceil((targetSecRef.current - currentElapsedSec()) / 60));
      setPomGoalId(null);
      setPomTaskId(null);
      setPomFocusTargetMins(remainingMins);
      const newTarget = remainingMins * 60;
      targetSecRef.current = newTarget;
      setPomSeconds(newTarget);
      accumulatedSecRef.current = 0;
      startedAtRef.current = null;
      return;
    }
    const startSecs = getFocusSeconds(pomFocusTargetMins, pomDurations);
    setPomSeconds(startSecs);
    targetSecRef.current = startSecs;
    accumulatedSecRef.current = 0;
    startedAtRef.current = null;
  }, [pomTaskId, pomFocusTargetMins, pomDurations, stopTimer]);

  const endFocusEarly = useCallback(() => {
    // Allow ending from either running OR paused state — both have real
    // elapsed time worth crediting. Bail only when nothing has actually
    // elapsed yet (idle dial / fresh reset). Read elapsed LIVE via
    // currentElapsedSec() (which sums accumulated + the active run from
    // startedAtRef) *before* stopTimer(): stopTimer banks the active run
    // through a setState updater that React defers past this synchronous
    // code, so reading accumulatedSecRef afterwards would miss the whole
    // running delta and under-credit (often to 0) a never-paused session.
    const elapsedSec = currentElapsedSec();
    stopTimer();
    if (elapsedSec <= 0) return;
    const mins = Math.max(1, Math.round(elapsedSec / 60));
    const at = new Date();
    const entry = {
      id: newId(),
      taskId: pomTaskId,
      goalId: pomGoalId,
      mins,
      at: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      day: localDateStr(at),
    };
    applyFocusLogUpdate((l) => [entry, ...l].slice(0, FOCUS_LOG_CAP));
    if (pomGoalId && pomTaskId) {
      applyGoalsUpdate((gs) => gs.map((g) =>
        g.id !== pomGoalId ? g : {
          ...g,
          tasks: g.tasks.map((t) =>
            t.id !== pomTaskId ? t : { ...t, sessions: (t.sessions || 0) + 1, totalTime: (t.totalTime || 0) + mins }
          ),
        }
      ));
    }
    setLastSession({ id: entry.id, taskId: pomTaskId, goalId: pomGoalId, mins, completedAt: at.toISOString(), kind: "early" });
    accumulatedSecRef.current = 0;
    startedAtRef.current = null;
    const task = pomGoalId && pomTaskId
      ? goals.find((g) => g.id === pomGoalId)?.tasks.find((t) => t.id === pomTaskId)
      : null;
    const focusMins = task?.eta || pomDurations.defaultFocus;
    setPomFocusTargetMins(focusMins);
    const nextSecs = getFocusSeconds(focusMins, pomDurations);
    targetSecRef.current = nextSecs;
    setPomSeconds(nextSecs);
  }, [pomTaskId, pomGoalId, goals, pomDurations, stopTimer, applyFocusLogUpdate, applyGoalsUpdate]);

  // Update a duration field (defaultFocus / break) and persist. When the
  // user is sitting idle with no task linked, reflect the new defaultFocus
  // on the dial immediately. With a task linked, the task's eta owns the
  // dial — don't override.
  const updatePomDuration = useCallback((field, value) => {
    const nextVal = Math.max(1, Number(value) || 1);
    const nextDurations = { ...pomDurations, [field]: nextVal };
    setPomDurations(nextDurations);
    updateSettings((prev) => ({ ...prev, pomDurations: nextDurations }));
    if (!pomRunning && !pomTaskId && field === "defaultFocus") {
      setPomFocusTargetMins(nextVal);
      const nextSecs = getFocusSeconds(nextVal, nextDurations);
      setPomSeconds(nextSecs);
      targetSecRef.current = nextSecs;
      accumulatedSecRef.current = 0;
      startedAtRef.current = null;
    }
  }, [pomDurations, pomRunning, pomTaskId, updateSettings]);

  const activeTask = pomGoalId && pomTaskId
    ? goals.find((g) => g.id === pomGoalId)?.tasks.find((t) => t.id === pomTaskId)
    : null;

  return {
    pomSeconds,
    pomRunning,
    pomTaskId,
    pomGoalId,
    pomFocusTargetMins,
    pomDurations,
    activeTask,
    lastSession,
    setPomRunning,
    startTaskTimer,
    stopTimer,
    resetTimer,
    endFocusEarly,
    updatePomDuration,
    dismissLastSession,
    updateLastSessionNote,
  };
}
