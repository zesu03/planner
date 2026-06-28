import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CAT_COLORS } from "../lib/constants";
import { todayStr, localDateStr } from "../lib/dates";
import { fmtTime, fmtMins, getFocusSeconds, focusStreakDays } from "../lib/focus";
import { isGoalDone, pct, isRecurring, isScheduledOn, isDoneOn } from "../lib/goals";
import { getAudioCtx } from "../lib/audio";
import { goldA, S } from "../lib/styles";
import { usePictureInPicture } from "../hooks/usePictureInPicture";
import MiniTimer from "../components/MiniTimer";
import FullscreenDial from "../components/FullscreenDial";

// Sum focusLog minutes for a YYYY-MM-DD key.
function minsForDay(focusLog, dayKey) {
  return focusLog.reduce((s, l) => (l.day === dayKey ? s + (l.mins || 0) : s), 0);
}

// Session-complete celebration with a "What moved forward?" prompt. The
// note saves on Enter or on blur (when non-empty), persists onto the
// focusLog entry, and surfaces a brief "Saved ✓" confirmation. Owns its
// own input state so dismissing the banner clears it cleanly.
function SessionBanner({ lastSession, goals, dismissLastSession, updateLastSessionNote }) {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);
  const sessionId = lastSession?.id;

  // New session arriving (or banner dismissed-then-reopened) → reset.
  useEffect(() => {
    setNote("");
    setSaved(false);
    // Autofocus so the user can just start typing what they did.
    if (sessionId && inputRef.current) inputRef.current.focus();
  }, [sessionId]);

  if (!lastSession) return null;
  const goal = lastSession.goalId ? goals.find((g) => g.id === lastSession.goalId) : null;
  const task = goal ? goal.tasks.find((t) => t.id === lastSession.taskId) : null;
  const cat = goal ? CAT_COLORS[goal.category] : "var(--gold)";
  const goalPct = goal && goal.tasks.length
    ? Math.round(goal.tasks.filter((t) => t.done).length / goal.tasks.length * 100)
    : null;
  const eyebrow = lastSession.kind === "early" ? "Session ended" : "Session complete";

  const commit = () => {
    if (!updateLastSessionNote) return;
    updateLastSessionNote(note);
    setSaved(true);
  };

  return (
    <div className="pop-in" style={{
      position: "relative",
      padding: "18px 20px",
      borderRadius: "var(--border-radius-lg)",
      background: `linear-gradient(135deg, ${goldA(18)} 0%, ${goldA(4)} 100%), var(--color-background-primary)`,
      border: `0.5px solid ${goldA(45)}`,
      marginBottom: 16,
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "var(--gold)" }} />
      <button onClick={dismissLastSession}
        aria-label="Dismiss"
        style={{
          position: "absolute", top: 10, right: 10,
          fontSize: 14, padding: "2px 8px",
          background: "transparent",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 99,
          color: "var(--color-text-tertiary)",
          cursor: "pointer", lineHeight: 1,
        }}>
        ✕
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{
          width: 46, height: 46, borderRadius: 12,
          background: goldA(22),
          border: `0.5px solid ${goldA(44)}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
        }}>✨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 3 }}>
            {eyebrow} · Alhamdulillah
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
            {lastSession.mins} {lastSession.mins === 1 ? "minute" : "minutes"} for Allah
          </div>
          {(task || goal) && (
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4, lineHeight: 1.45 }}>
              {task?.text || "General focus"}
              {goal && (
                <>
                  <span style={{ color: "var(--color-text-tertiary)", margin: "0 6px" }}>→</span>
                  <span style={{ color: cat, fontWeight: 500 }}>{goal.title}</span>
                  {goalPct != null && (
                    <span style={{ color: "var(--color-text-tertiary)", marginLeft: 6 }}>· {goalPct}%</span>
                  )}
                </>
              )}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 6, fontStyle: "italic" }}>
            "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ" — actions are by intentions.
          </div>
        </div>
      </div>

      {/* What-moved-forward prompt. Honest journal beats raw minutes —
          the note flows into Stats' Recent sessions and the AI Mirror,
          so what you actually did becomes part of the reflection. */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `0.5px dashed ${goldA(30)}` }}>
        <label htmlFor="session-note-input"
          style={{ display: "block", fontSize: 11, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>
          What moved forward?
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="session-note-input"
            ref={inputRef}
            type="text"
            value={note}
            onChange={(e) => { setNote(e.target.value); if (saved) setSaved(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              else if (e.key === "Escape") dismissLastSession();
            }}
            onBlur={() => { if (note.trim() && !saved) commit(); }}
            placeholder="e.g. drafted intro · fixed bug · distracted, slow"
            style={{ flex: 1, fontSize: 14, padding: "8px 12px", boxSizing: "border-box" }}
          />
          {saved
            ? <span style={{ fontSize: 12, color: "var(--color-text-success)", fontWeight: 600, whiteSpace: "nowrap" }}>Saved ✓</span>
            : note.trim()
              ? <button onClick={commit} className="btn-primary" style={{ padding: "6px 14px", fontSize: 13, whiteSpace: "nowrap" }}>Save</button>
              : <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic", whiteSpace: "nowrap" }}>Optional</span>}
        </div>
      </div>
    </div>
  );
}

// Daily progress: today's mins toward the goal, yesterday's total, streak,
// and a 7-day mini bar chart so the user sees the week at a glance.
// Designed to sit beside the timer dial as a sibling block.
// Slim "Today" strip — replaces the old competing 156px ring. A compact
// horizontal readout (today's minutes vs an editable daily goal + streak),
// a thin progress bar, and a 7-day bar row. Keeps the timer dial as the
// page's single hero.
function TodayStrip({ focusLog, todayMins, streak, goalMins, onEditGoal, style, liveSessionMins = 0 }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goalMins));

  const pct = Math.min(100, Math.round((todayMins / Math.max(1, goalMins)) * 100));
  const met = todayMins >= goalMins && goalMins > 0;

  const commit = () => {
    const v = Math.max(1, Math.min(720, Number(draft) || goalMins));
    onEditGoal(v);
    setEditing(false);
  };

  const DAYS = 7;
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = localDateStr(d);
    const isToday = i === 0;
    days.push({
      key: k,
      mins: minsForDay(focusLog, k) + (isToday ? liveSessionMins : 0),
      label: d.toLocaleDateString("en", { weekday: "narrow" }),
      isToday,
    });
  }
  const max = Math.max(goalMins, ...days.map((d) => d.mins), 1);

  return (
    <div style={{ ...S.card, ...style }}>
      {/* Header: today total · editable goal · streak */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>Today</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: met ? "var(--color-text-success)" : "var(--color-text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {fmtMins(todayMins)}
          </span>
          <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            /{" "}
            {editing ? (
              <input type="number" min="1" max="720" value={draft} autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") setEditing(false); }}
                onBlur={() => draft && commit()}
                style={{ width: 56, fontSize: 14, padding: "1px 4px", textAlign: "center", background: "transparent", color: "var(--gold)", border: "none", borderBottom: "1.5px solid var(--gold)", outline: "none" }} />
            ) : (
              <button onClick={() => { setDraft(String(goalMins)); setEditing(true); }} title="Set daily goal"
                style={{ fontSize: 13, color: "var(--gold)", background: "transparent", border: "none", borderBottom: "1px dashed transparent", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = goldA(50); }}
                onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}>
                {fmtMins(goalMins)}
              </button>
            )}{" "}
            goal
          </span>
        </div>
        {streak > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gold)" }}>🔥 {streak}-day streak</span>
        )}
      </div>

      {/* Thin progress bar */}
      <div style={{ height: 6, background: "var(--color-background-secondary)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: met ? "var(--color-text-success)" : "var(--gold)", borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>

      {/* Goal presets — only while editing */}
      {editing && (() => {
        const GOAL_PRESETS = [30, 60, 90, 120, 240];
        const apply = (m) => { onEditGoal(m); setEditing(false); };
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginRight: 4 }}>quick set</span>
            {GOAL_PRESETS.map((m) => {
              const active = m === goalMins;
              const label = m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`;
              return (
                <button key={m} onClick={() => apply(m)} title={`${m} minutes daily goal`}
                  style={{ fontSize: 13, padding: "4px 10px", borderRadius: 99, background: active ? "var(--gold)" : "var(--color-background-secondary)", border: `0.5px solid ${active ? "var(--gold)" : "var(--color-border-tertiary)"}`, color: active ? "#0f0f0f" : "var(--color-text-primary)", cursor: "pointer", fontWeight: active ? 600 : 500 }}>
                  {label}
                </button>
              );
            })}
            <button onClick={() => setEditing(false)} style={{ fontSize: 13, padding: "4px 10px", marginLeft: 4 }}>Close</button>
          </div>
        );
      })()}

      {/* 7-day bars */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 6, height: 46 }}>
        {days.map((d) => {
          const h = (d.mins / max) * 100;
          const hit = d.mins >= goalMins && goalMins > 0;
          return (
            <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${d.key} · ${d.mins}m`}>
              <div style={{ width: "100%", height: 32, display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%",
                  height: `${Math.max(2, h)}%`,
                  background: hit ? "var(--gold)" : "var(--color-background-secondary)",
                  border: d.isToday ? `1px solid ${hit ? "var(--gold)" : "var(--color-border-secondary)"}` : "none",
                  borderRadius: 3,
                  transition: "height 0.4s ease",
                }} />
              </div>
              <div style={{ fontSize: 10, color: d.isToday ? "var(--gold)" : "var(--color-text-tertiary)", fontWeight: d.isToday ? 600 : 400 }}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
    const v = Math.max(1, Number(focusDraft) || pomDurations.defaultFocus);
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
        dismissLastSession={dismissLastSession}
        updateLastSessionNote={updateLastSessionNote}
      />
      {/* Quiet niyyah lead-in — the "Bismillah — Start" button below carries
          the intention too, so this stays a one-line whisper, not a card. */}
      <div style={{ textAlign: "center", fontSize: 13, fontStyle: "italic", color: "var(--color-text-tertiary)", marginTop: 2, marginBottom: 18 }}>
        Make your intention before you begin — this effort is for Allah.
      </div>

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
        background: "radial-gradient(120% 75% at 50% 0%, color-mix(in srgb, var(--gold) 6%, transparent) 0%, transparent 58%), var(--color-background-primary)",
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
              <div style={{ position: "relative", width: DIAL, height: DIAL, marginBottom: 4 }}>
                <div
                  aria-hidden
                  className={pomRunning ? "dial-breath" : ""}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: DIAL + 60,
                    height: DIAL + 60,
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    background: `radial-gradient(circle, color-mix(in srgb, ${ringColor} 22%, transparent) 0%, transparent 65%)`,
                    opacity: pomRunning ? 0.8 : 0.3,
                    pointerEvents: "none",
                    transition: "opacity 0.4s ease, background 0.3s ease",
                  }}
                />
                <svg width={DIAL} height={DIAL} viewBox={`0 0 ${DIAL} ${DIAL}`}
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
                    fill="none" stroke="var(--color-background-secondary)" strokeWidth="13" opacity="0.7" />
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
                      onClick={canEditDial ? enterDialEdit : undefined}
                      opacity={paused ? 0.85 : 1}
                      style={{
                        fontSize: 56, fontWeight: 600,
                        fill: paused ? "var(--gold)" : "var(--color-text-primary)",
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
                      fill: paused ? "var(--color-text-warning)" : "var(--color-text-secondary)",
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                      fontWeight: paused ? 600 : 400,
                      transition: "fill 0.3s",
                      cursor: canEditDial && !editingFocus ? "pointer" : "default",
                    }}>
                    {editingFocus ? "set length" : paused ? `paused · ${fmtTime(pomSeconds)} left` : canEditDial ? "focus · tap to edit" : "focus"}
                  </text>
                </svg>
                {editingFocus && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -75%)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <input
                      type="number"
                      min="1"
                      value={focusDraft}
                      onChange={(e) => setFocusDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitFocusLength();
                        else if (e.key === "Escape") setEditingFocus(false);
                      }}
                      onBlur={() => focusDraft && commitFocusLength()}
                      autoFocus
                      style={{
                        width: 90,
                        fontSize: 44,
                        fontWeight: 500,
                        textAlign: "center",
                        padding: "2px 4px",
                        fontVariantNumeric: "tabular-nums",
                        background: "transparent",
                        color: "var(--color-text-primary)",
                        border: "none",
                        borderBottom: `2px solid ${goldA(60)}`,
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 18, color: "var(--color-text-tertiary)" }}>m</span>
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
                <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase" }}>
                  Focus length
                </span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                  {FOCUS_PRESETS.map((m) => {
                    const active = m === cur;
                    return (
                      <button key={m}
                        onClick={() => !pomRunning && updatePomDuration("defaultFocus", m)}
                        disabled={pomRunning}
                        title={pomRunning ? "Pause to change focus length" : `Set focus to ${m} minutes`}
                        style={{
                          fontSize: 13,
                          padding: "4px 10px",
                          borderRadius: 99,
                          background: active ? goldA(22) : "var(--color-background-secondary)",
                          border: `0.5px solid ${active ? goldA(60) : "var(--color-border-tertiary)"}`,
                          color: active ? "var(--gold)" : pomRunning ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                          cursor: pomRunning ? "not-allowed" : "pointer",
                          fontWeight: active ? 600 : 500,
                        }}>
                        {m}m
                      </button>
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
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
                  Working on
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)" }}>
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
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 600 }}>
                      Goal progress
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: catColor }}>
                      {goalPct}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--color-background-primary)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${goalPct}%`, background: catColor, transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      {tasksTotal > 0 && `${tasksDone}/${tasksTotal} task${tasksTotal === 1 ? "" : "s"} done`}
                      {tasksTotal > 0 && habits.length > 0 && " · "}
                      {habits.length > 0 && `${habits.length} habit${habits.length === 1 ? "" : "s"}`}
                    </span>
                    {goalFocusMins > 0 && (
                      <span style={{ color: "var(--color-text-tertiary)" }}>
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
                    color: "var(--color-text-primary)",
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
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center" }}>
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
          style={{ fontSize: 13, padding: "7px 14px", color: "var(--color-text-tertiary)", opacity: pip.supported ? 1 : 0.5, cursor: pip.supported ? "pointer" : "not-allowed" }}>
          {pip.pipWindow ? "Close pop-out" : "Pop out ⧉"}
        </button>
        <button
          onClick={enterFullscreen}
          title="Hide everything else — just the dial, the task, and the niyyah"
          style={{ fontSize: 13, padding: "7px 14px", color: "var(--color-text-tertiary)" }}>
          Focus mode ⛶
        </button>
      </div>

      {/* Today — slim progress strip (no competing ring) */}
      <TodayStrip
        focusLog={focusLog}
        todayMins={todayMins}
        liveSessionMins={liveSessionMins}
        streak={streak}
        goalMins={dailyFocusGoalMins}
        onEditGoal={updateDailyFocusGoal}
        style={{ maxWidth: 560, margin: "0 auto 16px" }}
      />

      {/* Up next */}
      {upcoming.length > 0 && (
        <div style={{ ...S.card }}>
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 10 }}>
            Up next
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
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.text}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
