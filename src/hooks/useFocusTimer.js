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

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DURATIONS } from "../lib/constants";
import { newId } from "../lib/ids";
import { localDateStr } from "../lib/dates";
import { getFocusSeconds } from "../lib/focus";
import { getAudioCtx, playTimerSound } from "../lib/audio";

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
  const [pomRunning, setPomRunning] = useState(false);
  const [pomTaskId, setPomTaskId] = useState(null);
  const [pomGoalId, setPomGoalId] = useState(null);
  const [pomFocusTargetMins, setPomFocusTargetMins] = useState(DEFAULT_DURATIONS.defaultFocus);
  // The most-recent finished session, used to render the celebration banner
  // on the Focus tab. Clears when a new session starts or the user dismisses.
  // Shape: { taskId, goalId, mins, completedAt, kind: "complete" | "early" }
  const [lastSession, setLastSession] = useState(null);
  const intervalRef = useRef(null);
  const elapsedRef = useRef(0);
  const settingsAppliedRef = useRef(false);

  // Restore pom durations + dial defaults from settings on first load.
  useEffect(() => {
    if (settingsAppliedRef.current || !settingsFromDb?.pomDurations) return;
    settingsAppliedRef.current = true;
    setPomDurations(settingsFromDb.pomDurations);
    setPomSeconds(getFocusSeconds(null, settingsFromDb.pomDurations));
    setPomFocusTargetMins(settingsFromDb.pomDurations.defaultFocus || DEFAULT_DURATIONS.defaultFocus);
  }, [settingsFromDb]);

  const stopTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    setPomRunning(false);
  }, []);

  // The tick. On completion, log the session, bump the task counters,
  // chime, and reset the dial to the next session length (linked task's
  // ETA, else defaultFocus).
  useEffect(() => {
    if (!pomRunning) return () => clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setPomSeconds((s) => {
        if (s <= 1) {
          const mins = Math.max(1, Math.round(pomFocusTargetMins));
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
          setLastSession({ taskId: pomTaskId, goalId: pomGoalId, mins, completedAt: at.toISOString(), kind: "complete" });
          playTimerSound("focusEnd");
          elapsedRef.current = 0;
          const task = pomGoalId && pomTaskId
            ? goals.find((g) => g.id === pomGoalId)?.tasks.find((t) => t.id === pomTaskId)
            : null;
          const nextMins = task?.eta || pomDurations.defaultFocus;
          setPomFocusTargetMins(nextMins);
          setPomRunning(false);
          return getFocusSeconds(nextMins, pomDurations);
        }
        elapsedRef.current += 1;
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [pomRunning, pomGoalId, pomTaskId, pomFocusTargetMins, pomDurations, goals, applyGoalsUpdate, applyFocusLogUpdate]);

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
    setPomSeconds(getFocusSeconds(focusMins, pomDurations));
    elapsedRef.current = 0;
    setLastSession(null); // a new session begins — close the previous celebration
    setPomRunning(true);
    if (onSessionStart) onSessionStart();
  }, [pomRunning, pomTaskId, goals, pomDurations, stopTimer, onSessionStart]);

  const dismissLastSession = useCallback(() => setLastSession(null), []);

  // Dual behaviour:
  //  - If a task is linked, delink it but preserve remaining minutes as a
  //    fresh general focus block — abort the task without losing the
  //    time you'd set aside.
  //  - No task linked: just reset to default focus length.
  const resetTimer = useCallback(() => {
    stopTimer();
    if (pomTaskId) {
      const remainingMins = Math.max(1, Math.ceil(pomSeconds / 60));
      setPomGoalId(null);
      setPomTaskId(null);
      setPomFocusTargetMins(remainingMins);
      setPomSeconds(remainingMins * 60);
      elapsedRef.current = 0;
      return;
    }
    setPomSeconds(getFocusSeconds(pomFocusTargetMins, pomDurations));
    elapsedRef.current = 0;
  }, [pomTaskId, pomSeconds, pomFocusTargetMins, pomDurations, stopTimer]);

  const endFocusEarly = useCallback(() => {
    if (!pomRunning) return;
    const mins = Math.max(1, Math.round(elapsedRef.current / 60));
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
    setLastSession({ taskId: pomTaskId, goalId: pomGoalId, mins, completedAt: at.toISOString(), kind: "early" });
    stopTimer();
    elapsedRef.current = 0;
    const task = pomGoalId && pomTaskId
      ? goals.find((g) => g.id === pomGoalId)?.tasks.find((t) => t.id === pomTaskId)
      : null;
    const focusMins = task?.eta || pomDurations.defaultFocus;
    setPomFocusTargetMins(focusMins);
    setPomSeconds(getFocusSeconds(focusMins, pomDurations));
  }, [pomRunning, pomTaskId, pomGoalId, goals, pomDurations, stopTimer, applyFocusLogUpdate, applyGoalsUpdate]);

  // Update a duration field (defaultFocus / break) and persist. When the
  // user is sitting idle with no task linked, reflect the new defaultFocus
  // on the dial immediately. With a task linked, the task's eta owns the
  // dial — don't override.
  const updatePomDuration = useCallback((field, value) => {
    const nextVal = Math.max(1, Number(value) || 1);
    const nextDurations = { ...pomDurations, [field]: nextVal };
    setPomDurations(nextDurations);
    updateSettings({ ...userSettings, pomDurations: nextDurations });
    if (!pomRunning && !pomTaskId && field === "defaultFocus") {
      setPomFocusTargetMins(nextVal);
      setPomSeconds(getFocusSeconds(nextVal, nextDurations));
      elapsedRef.current = 0;
    }
  }, [pomDurations, pomRunning, pomTaskId, userSettings, updateSettings]);

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
  };
}
