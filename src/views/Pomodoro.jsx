import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CAT_COLORS } from "../lib/constants";
import { Icon } from "../components/icons";
import Chip from "../components/Chip";
import { todayStr } from "../lib/dates";
import { fmtTime, fmtMins, getFocusSeconds, focusStreakDays, minsForDay, parseDuration } from "../lib/focus";
import { isGoalDone, pct, isRecurring, isScheduledOn, isDoneOn } from "../lib/goals";
import { getAudioCtx } from "../lib/audio";
import { goldA, S } from "../lib/styles";
import { usePictureInPicture } from "../hooks/usePictureInPicture";
import MiniTimer from "../components/MiniTimer";
import FullscreenDial from "../components/FullscreenDial";
import SessionBanner from "../components/focus/SessionBanner";
import TodayStrip from "../components/focus/TodayStrip";

// Focus tab. Two side-by-side blocks: the dial (with the active task / niyyah
// inside) and Daily progress. No break mode, no separate settings card —
// when no task is linked, focus length is editable inline beneath the dial.
export default function Pomodoro({
  goals,
  focusLog,
  activeTask,
  pomGoalId,
  pomTaskId,
  pomSeconds,
  pomRunning,
  pomDurations,
  pomFocusTargetMins,
  setPomRunning,
  stopTimer,
  resetTimer,
  endFocusEarly,
  updatePomDuration,
  startTaskTimer,
  toggleTask,
  dailyFocusGoalMins,
  updateDailyFocusGoal,
  lastSession,
  dismissLastSession,
  updateLastSessionNote,
}) {
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState(String(pomDurations.defaultFocus));
  // Document Picture-in-Picture pop-out. Chromium-only; on Firefox/Safari
  // `pip.supported` is false and the button shows a disabled tooltip.
  const pip = usePictureInPicture({ width: 240, height: 290 });

  // Immersive focus mode. CSS-overlay always; also try the browser
  // Fullscreen API for true chrome-hiding immersion when supported. iOS
  // Safari doesn't support requestFullscreen — the overlay still works
  // there, just without hiding the URL bar. We listen for
  // fullscreenchange so a user pressing the OS-level F11 / Esc keeps
  // our state in sync.
  const [fullscreen, setFullscreen] = useState(false);
  const enterFullscreen = async () => {
    setFullscreen(true);
    try { await document.documentElement.requestFullscreen?.(); } catch { /* user denied or unsupported — overlay still applies */ }
  };
  const exitFullscreen = async () => {
    setFullscreen(false);
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* already exited */ }
    }
  };
  useEffect(() => {
    const onChange = () => {
      // Browser exited fullscreen (F11, Esc) — collapse our overlay too.
      if (!document.fullscreenElement) setFullscreen((cur) => (cur ? false : cur));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Dial geometry.
  const DIAL = 280;
  const DIAL_R = 110;
  const DIAL_C = 2 * Math.PI * DIAL_R;
  const total = getFocusSeconds(pomFocusTargetMins, pomDurations);
  const prog = total > 0 ? (total - pomSeconds) / total : 0;
  // Paused = the user pressed Start at least once (progress > 0) but the
  // timer is currently stopped. Idle = at full time, never started. Both
  // are "not running" but they need different visual signals.
  const paused = !pomRunning && prog > 0 && prog < 1;
  // Elapsed seconds in this session. When paused we surface this in the
  // dial center (Windows-stopwatch style — the captured time at pause)
  // rather than the remaining countdown.
  const elapsedSecs = Math.max(0, total - pomSeconds);
  const dialSecs = paused ? elapsedSecs : pomSeconds;

  const activeGoal = pomGoalId ? goals.find((g) => g.id === pomGoalId) : null;
  const ringColor = activeGoal ? CAT_COLORS[activeGoal.category] : "var(--gold)";

  // "Open" handles both flavours: one-shot tasks are open if !done; habit
  // tasks are open only when scheduled today AND not yet ticked. Avoids
  // surfacing Mon/Thu habits on a Wednesday in the "up next" list.
  const upcoming = goals
    .filter((g) => !isGoalDone(g))
    .flatMap((g) =>
      g.tasks
        .filter((t) => {
          if (g.id === pomGoalId && t.id === pomTaskId) return false;
          return isRecurring(t) ? (isScheduledOn(t) && !isDoneOn(t)) : !t.done;
        })
        .map((t) => ({ g, t }))
    )
    .sort((a, b) => new Date(a.g.due) - new Date(b.g.due))
    .slice(0, 5);

  const today = todayStr();
  // Live in-progress minutes from the current session. `total - pomSeconds`
  // is the elapsed seconds while running AND holds the paused value when
  // the user pauses (because the interval clears but pomSeconds keeps its
  // last value). Resets cleanly on session-complete / endFocusEarly /
  // resetTimer because each of those sets pomSeconds = total. Math.floor
  // so a partial minute doesn't bump the display prematurely.
  const liveSessionMins = Math.floor(Math.max(0, total - pomSeconds) / 60);
  const todayLoggedMins = minsForDay(focusLog, today);
  const todayMins = todayLoggedMins + liveSessionMins;
  // Streak still uses focusLog only — a streak is about completed sessions
  // hitting the goal, not in-progress work. A 59/60 min session in progress
  // shouldn't claim the streak before it lands.
  const streak = focusStreakDays(focusLog, dailyFocusGoalMins);

  const handleStart = () => {
    if (pomRunning) {
      stopTimer();
    } else {
      // Pre-warm AudioContext under the click so the end chime can fire later.
      getAudioCtx();
      setPomRunning(true);
    }
  };

  // Keyboard shortcuts — Space toggles run/pause, Esc ends a session in
  // progress (or, when fullscreen mode is open, exits fullscreen without
  // ending the session). Suppressed while the user is typing in any
  // input/textarea so the session-note field doesn't fight the shortcut.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handleStart();
      } else if (e.key === "Escape") {
        if (fullscreen) exitFullscreen();
        else endFocusEarly();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pomRunning, stopTimer, setPomRunning, endFocusEarly, fullscreen]);

  const commitFocusLength = () => {
    const parsed = parseDuration(focusDraft);
    const v = Math.max(1, parsed ?? pomDurations.defaultFocus);
    updatePomDuration("defaultFocus", v);
    setEditingFocus(false);
  };

  // Session-complete celebration lives in <SessionBanner/> above — it owns
  // the "What moved forward?" input state and writes the note back onto
  // the focusLog entry. Pomodoro just supplies the data and callbacks.

  return (
    <div className="view-content">
      <SessionBanner
        lastSession={lastSession}
        goals={goals}
        toggleTask={toggleTask}
        dismissLastSession={dismissLastSession}
        updateLastSessionNote={updateLastSessionNote}
      />
      {/* Quiet niyyah lead-in — the "Bismillah — Start" button below carries
          the intention too, so this stays a one-line whisper, not a card. */}
      <div style={{ textAlign: "center", fontSize: 13, fontStyle: "italic", color: "var(--text-muted)", marginTop: 2, marginBottom: 18 }}>
        Make your intention before you begin — this effort is for Allah.
      </div>

      {/* Focus Console — two columns on desktop (dial + controls | companion
          rail), stacked on mobile. See .focus-console in index.css. */}
      <div className="focus-console">
        <div className="focus-console-main">
      {/* Hero — the dial is the single focal point, centered with breathing
          room. Daily progress moved below the controls as a slim strip so
          nothing competes with the timer. */}
      <div style={{
        ...S.card,
        maxWidth: 460,
        margin: "0 auto 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "28px 20px",
        background: "radial-gradient(120% 75% at 50% 0%, color-mix(in srgb, var(--gold) 6%, transparent) 0%, transparent 58%), var(--bg-card)",
        boxShadow: "var(--shadow-card)",
      }}>
          {(() => {
            // Dial is directly click-to-edit when idle and no task is linked.
            // Running / paused / linked-task states show the live countdown
            // (or elapsed when paused) instead — editing those would be
            // surprising mid-session.
            const canEditDial = !pomRunning && !paused && !pomTaskId;
            const enterDialEdit = () => {
              if (!canEditDial) return;
              setFocusDraft(String(pomDurations.defaultFocus));
              setEditingFocus(true);
            };
            return (
              <div className="focus-dial" style={{ position: "relative", marginBottom: 4 }}>
                <div
                  aria-hidden
                  className={pomRunning ? "dial-breath" : ""}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "calc(100% + 56px)",
                    height: "calc(100% + 56px)",
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    background: `radial-gradient(circle, color-mix(in srgb, ${ringColor} 22%, transparent) 0%, transparent 65%)`,
                    opacity: pomRunning ? 0.8 : 0.3,
                    pointerEvents: "none",
                    transition: "opacity 0.4s ease, background 0.3s ease",
                  }}
                />
                <svg width="100%" height="100%" viewBox={`0 0 ${DIAL} ${DIAL}`}
                  role="timer"
                  aria-label={paused
                    ? `Focus timer paused: ${fmtTime(elapsedSecs)} elapsed, ${fmtTime(pomSeconds)} remaining`
                    : `Focus timer ${pomRunning ? "running" : "ready"}: ${fmtTime(pomSeconds)} remaining`}
                  style={{ position: "relative" }}>
                  <defs>
                    {/* Glossy arc: the ring colour brightening into a lit
                        highlight along its length — reads premium vs a flat
                        solid stroke. */}
                    <linearGradient id="dialGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={ringColor} />
                      <stop offset="100%" stopColor={`color-mix(in srgb, ${ringColor} 55%, #ffffff)`} />
                    </linearGradient>
                    {/* Soft halo around the progress arc. */}
                    <filter id="dialGlow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <circle cx={DIAL / 2} cy={DIAL / 2} r={DIAL_R}
                    fill="none" stroke="color-mix(in srgb, var(--gold) 22%, transparent)" strokeWidth="13" opacity="0.9" />
                  <circle cx={DIAL / 2} cy={DIAL / 2} r={DIAL_R}
                    fill="none"
                    stroke="url(#dialGrad)"
                    strokeWidth="13"
                    strokeDasharray={DIAL_C}
                    strokeDashoffset={DIAL_C * (1 - prog)}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${DIAL / 2} ${DIAL / 2})`}
                    opacity={paused ? 0.5 : 1}
                    filter="url(#dialGlow)"
                    style={{ transition: "stroke-dashoffset 0.5s, opacity 0.3s" }} />
                  {!editingFocus && (
                    <text x={DIAL / 2} y={DIAL / 2 - 6} textAnchor="middle"
                      className="serif"
                      onClick={canEditDial ? enterDialEdit : undefined}
                      opacity={paused ? 0.85 : 1}
                      style={{
                        fontSize: 56, fontWeight: 600,
                        fill: paused ? "var(--gold)" : "var(--text-primary)",
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "-1px",
                        transition: "opacity 0.3s, fill 0.3s",
                        cursor: canEditDial ? "pointer" : "default",
                      }}>
                      {fmtTime(dialSecs)}
                    </text>
                  )}
                  <text x={DIAL / 2} y={DIAL / 2 + 26} textAnchor="middle"
                    onClick={canEditDial && !editingFocus ? enterDialEdit : undefined}
                    style={{
                      fontSize: 14,
                      fill: paused ? "var(--color-text-warning)" : "var(--text-secondary)",
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                      fontWeight: paused ? 600 : 400,
                      transition: "fill 0.3s",
                      cursor: canEditDial && !editingFocus ? "pointer" : "default",
                    }}>
                    {editingFocus ? "set length · 90 or 2h" : paused ? `paused · ${fmtTime(pomSeconds)} left` : canEditDial ? "focus · tap to edit" : "focus"}
                  </text>
                </svg>
                {editingFocus && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -75%)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <input
                      type="text"
                      inputMode="text"
                      value={focusDraft}
                      placeholder="90 or 2h"
                      onChange={(e) => setFocusDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitFocusLength();
                        else if (e.key === "Escape") setEditingFocus(false);
                      }}
                      onBlur={() => focusDraft && commitFocusLength()}
                      autoFocus
                      style={{
                        width: 150,
                        fontSize: 44,
                        fontWeight: 500,
                        textAlign: "center",
                        padding: "2px 4px",
                        fontVariantNumeric: "tabular-nums",
                        background: "transparent",
                        color: "var(--text-primary)",
                        border: "none",
                        borderBottom: `2px solid ${goldA(60)}`,
                        outline: "none",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Focus-length presets — only when no task is linked. With a task
              linked, the task's ETA drives the dial and this is hidden.
              The dial center itself is click-to-edit for custom values, so
              there's no separate Custom / pen button here. */}
          {!pomTaskId && (() => {
            const FOCUS_PRESETS = [25, 45, 60, 90];
            const cur = pomDurations.defaultFocus;
            return (
              <div style={{ marginTop: 6, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.4px", textTransform: "uppercase" }}>
                  Focus length
                </span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                  {FOCUS_PRESETS.map((m) => {
                    const active = m === cur;
                    return (
                      <Chip key={m}
                        active={active}
                        disabled={pomRunning}
                        onClick={() => !pomRunning && updatePomDuration("defaultFocus", m)}
                        title={pomRunning ? "Pause to change focus length" : `Set focus to ${m} minutes`}
                        style={{ fontSize: 13, padding: "4px 12px" }}>
                        {m}m
                      </Chip>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Working on (task linked) — shows the parent goal's progress
              and total focus logged to it, so each session feels like
              moving the goal forward, not just clocking time. */}
          {activeTask && activeGoal && (() => {
            const goalPct = pct(activeGoal);
            // Match the semantics of pct() — one-shot tasks only. The
            // accompanying "N habits" label below adds habit-count context
            // when the goal mixes tasks and habits.
            const oneShots = activeGoal.tasks.filter((t) => !isRecurring(t));
            const habits = activeGoal.tasks.filter((t) => isRecurring(t));
            const tasksDone = oneShots.filter((t) => t.done).length;
            const tasksTotal = oneShots.length;
            const goalFocusMins = focusLog
              .filter((l) => l.goalId === activeGoal.id)
              .reduce((s, l) => s + (l.mins || 0), 0);
            const catColor = CAT_COLORS[activeGoal.category];
            return (
              <div style={{ textAlign: "center", marginTop: 10, width: "100%" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
                  Working on
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)" }}>
                  {activeTask.text}
                </div>
                <div style={{ fontSize: 13, color: catColor, marginTop: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: catColor, display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />
                  {activeGoal.title} · ETA {activeTask.eta}m
                </div>

                {/* Parent-goal progress strip — concrete proof that this
                    session moves a bigger thing forward. */}
                <div style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  border: "0.5px solid var(--color-border-tertiary)",
                  textAlign: "left",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 600 }}>
                      Goal progress
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: catColor }}>
                      {goalPct}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-card)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${goalPct}%`, background: catColor, transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      {tasksTotal > 0 && `${tasksDone}/${tasksTotal} task${tasksTotal === 1 ? "" : "s"} done`}
                      {tasksTotal > 0 && habits.length > 0 && " · "}
                      {habits.length > 0 && `${habits.length} habit${habits.length === 1 ? "" : "s"}`}
                    </span>
                    {goalFocusMins > 0 && (
                      <span style={{ color: "var(--text-muted)" }}>
                        {fmtMins(goalFocusMins)} logged total
                      </span>
                    )}
                  </div>
                </div>

                {activeGoal.intention && (
                  <div style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--text-primary)",
                    background: `linear-gradient(135deg, ${goldA(10)} 0%, ${goldA(3)} 100%)`,
                    border: `0.5px solid ${goldA(28)}`,
                    borderRadius: "var(--border-radius-md)",
                    lineHeight: 1.55,
                  }}>
                    <span style={{ color: "var(--gold)", fontStyle: "normal", fontWeight: 600, fontSize: 11, letterSpacing: "0.5px", textTransform: "uppercase", marginRight: 6 }}>
                      Niyyah
                    </span>
                    {activeGoal.intention}
                  </div>
                )}
              </div>
            );
          })()}
          {!activeTask && (
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
              No task linked · general focus block
            </div>
          )}
      </div>

      {/* primary controls — directly under the dial */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        <button onClick={handleStart} className="btn-primary" style={{ padding: "11px 36px" }}>
          {pomRunning ? "Pause" : paused ? "Resume" : "Bismillah — Start"}
        </button>
        <button
          onClick={resetTimer}
          title={pomTaskId ? "Delink the task and keep your remaining time" : "Reset to default focus length"}
          style={{ fontSize: 16, padding: "9px 18px" }}>
          Reset
        </button>
        {(pomRunning || paused) && (
          <button onClick={endFocusEarly} style={{ fontSize: 16, padding: "9px 18px" }}>
            End focus
          </button>
        )}
        {/* Secondary "view" options — smaller + muted so the core actions
            (Start / Reset / End) lead the row. */}
        <button
          onClick={() => (pip.pipWindow ? pip.close() : pip.open())}
          disabled={!pip.supported}
          title={pip.supported
            ? (pip.pipWindow ? "Close pop-out" : "Open a floating timer that stays on top")
            : "Pop-out requires Chrome or Edge"}
          style={{ fontSize: 13, padding: "7px 14px", color: "var(--text-muted)", opacity: pip.supported ? 1 : 0.5, cursor: pip.supported ? "pointer" : "not-allowed" }}>
          {pip.pipWindow ? "Close pop-out" : "Pop out ⧉"}
        </button>
        <button
          onClick={enterFullscreen}
          title="Hide everything else — just the dial, the task, and the niyyah"
          style={{ fontSize: 13, padding: "7px 14px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Focus mode <Icon name="maximize" size={13} />
        </button>
      </div>
        </div>{/* .focus-console-main */}

        <div className="focus-console-rail">
      {/* Today — slim progress strip (no competing ring) */}
      <TodayStrip
        focusLog={focusLog}
        todayMins={todayMins}
        liveSessionMins={liveSessionMins}
        streak={streak}
        goalMins={dailyFocusGoalMins}
        onEditGoal={updateDailyFocusGoal}
        style={{ margin: 0 }}
      />

      {/* Focus on — pick an open task to run a session against (its ETA drives
          the dial); click starts immediately. */}
      {upcoming.length > 0 && (
        <div style={{ ...S.card, margin: 0 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 10 }}>
            Focus on
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map(({ g, t }) => {
              const cat = CAT_COLORS[g.category];
              return (
                <div key={`${g.id}:${t.id}`} className="tile-hover"
                  onClick={() => startTaskTimer(g.id, t.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Start focus on ${t.text} from ${g.title}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startTaskTimer(g.id, t.id); } }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--border-radius-md)",
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid transparent",
                    cursor: "pointer",
                  }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.text}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.title} · {fmtMins(t.eta || 30)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: cat,
                    border: `0.5px solid ${cat}66`,
                    padding: "3px 10px",
                    borderRadius: 99,
                    flexShrink: 0,
                  }}>
                    Start ›
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Focus-on empty state — keeps the rail balanced when there are no open
          tasks yet, and nudges toward creating one. */}
      {upcoming.length === 0 && (
        <div style={{ ...S.card, margin: 0 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>
            Focus on
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>
            No open tasks. Add a goal and its tasks appear here to focus on — or just hit <span style={{ color: "var(--text-secondary)" }}>Bismillah — Start</span> for a general block.
          </div>
        </div>
      )}

      {/* Recent sessions — recent focusLog entries, so the rail carries a
          sense of momentum next to the dial. */}
      {focusLog.length > 0 && (
        <div style={{ ...S.card, margin: 0 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 10 }}>
            Recent sessions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {focusLog.slice(0, 4).map((l) => {
              const g = l.goalId ? goals.find((x) => x.id === l.goalId) : null;
              const t = g && l.taskId ? g.tasks.find((x) => x.id === l.taskId) : null;
              const cat = g ? CAT_COLORS[g.category] : "var(--text-muted)";
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: cat, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t ? t.text : "General focus"}
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtMins(l.mins)}</span>
                  <span style={{ color: "var(--text-muted)", flexShrink: 0, fontSize: 12 }}>{l.day === todayStr() ? "today" : (l.day || "").slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </div>{/* .focus-console-rail */}
      </div>{/* .focus-console */}

      {/* PiP portal — only rendered when the pop-out window is open. The
          portal lives in the parent React tree, so timer state updates
          propagate automatically without any manual sync. */}
      {pip.pipWindow && createPortal(
        <MiniTimer
          pomSeconds={pomSeconds}
          pomRunning={pomRunning}
          total={total}
          ringColor={ringColor}
          onToggle={handleStart}
        />,
        pip.pipWindow.document.body,
      )}

      {/* Immersive focus mode overlay. Portaled to body so other fixed
          elements (header, tabbar) can't sit on top via z-index. */}
      {fullscreen && createPortal(
        <FullscreenDial
          open
          pomSeconds={pomSeconds}
          pomRunning={pomRunning}
          paused={paused}
          total={total}
          ringColor={ringColor}
          activeTask={activeTask}
          activeGoal={activeGoal}
          onToggleRun={handleStart}
          onEndEarly={endFocusEarly}
          onExit={exitFullscreen}
        />,
        document.body,
      )}
    </div>
  );
}
