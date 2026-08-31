import { useState, useEffect, useRef } from "react";
import { CAT_COLORS } from "../../lib/constants";
import { Icon } from "../icons";
import { pct, isRecurring, isDoneOn } from "../../lib/goals";
import { goldA } from "../../lib/styles";

// Session-complete celebration with a "What moved forward?" prompt. The
// note saves on Enter or on blur (when non-empty), persists onto the
// focusLog entry, and surfaces a brief "Saved ✓" confirmation. Owns its
// own input state so dismissing the banner clears it cleanly.
// (Moved out of views/Pomodoro.jsx during the Phase 4 modular refactor.)
export default function SessionBanner({ lastSession, goals, toggleTask, dismissLastSession, updateLastSessionNote }) {
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
  // Progress excludes habits (see lib/goals pct) — this is the number that
  // should tick up the instant you mark the task done below.
  const goalPct = goal ? pct(goal) : null;
  const isHabit = task ? isRecurring(task) : false;
  const taskDone = task ? isDoneOn(task) : false;
  const eyebrow = lastSession.kind === "early" ? "Session ended" : "Session complete";

  // Close the focus→completion loop from the celebration itself. Same path
  // as the Goal-detail checkbox (toggleTask): a one-shot flips `done` and may
  // auto-complete the parent goal; a habit ticks today into `completions`.
  const markDone = () => {
    if (!toggleTask || !goal || !task) return;
    toggleTask(goal.id, task.id);
  };

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
      background: `linear-gradient(135deg, ${goldA(18)} 0%, ${goldA(4)} 100%), var(--bg-card)`,
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
          color: "var(--text-muted)",
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
          fontSize: 22, flexShrink: 0, color: "var(--gold)",
        }}><Icon name="sparkles" size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 3 }}>
            {eyebrow} · Alhamdulillah
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span className="serif" style={{ fontSize: 30, fontWeight: 600, color: "var(--text-primary)", lineHeight: 0.95 }}>
              {lastSession.mins}
            </span>
            <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>
              {lastSession.mins === 1 ? "minute" : "minutes"} for Allah
            </span>
          </div>
          {(task || goal) && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.45 }}>
              {task?.text || "General focus"}
              {goal && (
                <>
                  <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>→</span>
                  <span style={{ color: cat, fontWeight: 500 }}>{goal.title}</span>
                  {goalPct != null && (
                    <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>· {goalPct}%</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Close the loop: a focus session credits time but never completes the
          task, so the goal wouldn't advance on its own. Offer completion here.
          Optional — a multi-session task needs several blocks first, so this is
          a choice, not automatic. A habit "logs today" instead of finishing. */}
      {task && toggleTask && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={markDone}
            title={taskDone ? "Undo" : undefined}
            className={taskDone ? undefined : "btn-primary"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 99, cursor: "pointer",
              ...(taskDone ? {
                background: "var(--color-background-success)",
                border: "0.5px solid var(--color-border-success)",
                color: "var(--color-text-success)",
              } : {}),
            }}>
            <Icon name="check" size={14} />
            {taskDone
              ? (isHabit ? "Logged for today" : "Task done")
              : (isHabit ? "Log for today" : "Mark task done")}
          </button>
          {!taskDone && (
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              or start another session
            </span>
          )}
        </div>
      )}

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
            style={{ flex: 1, fontSize: 16, padding: "8px 12px", boxSizing: "border-box" }}
          />
          {saved
            ? <span style={{ fontSize: 12, color: "var(--color-text-success)", fontWeight: 600, whiteSpace: "nowrap" }}>Saved ✓</span>
            : note.trim()
              ? <button onClick={commit} className="btn-primary" style={{ padding: "6px 14px", fontSize: 13, whiteSpace: "nowrap" }}>Save</button>
              : <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", whiteSpace: "nowrap" }}>Optional</span>}
        </div>
      </div>

      {/* Hadith footer — the niyyah closer, centered so it reads as the seal
          on the whole card rather than a caption on the minutes line. */}
      <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", lineHeight: 1.5 }}>
        "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ" — actions are by intentions.
      </div>
    </div>
  );
}
