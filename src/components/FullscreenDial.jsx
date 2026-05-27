import { useEffect } from "react";
import { CAT_COLORS } from "../lib/constants";
import { fmtTime } from "../lib/focus";
import { goldA } from "../lib/styles";

// Immersive full-screen focus mode. A bigger dial, the task you're working
// on, the niyyah behind it, and just enough controls to pause / end /
// leave. Everything else (tabs, header, side blocks, lists) is hidden so
// the only thing in front of the user is the work.
//
// Rendered via portal from Pomodoro when `open` is true. Geometry scales
// from viewport so it looks right on phone, tablet, and large desktop.
//
// Esc handling: the parent Pomodoro view intercepts Escape and calls
// onExit (instead of endFocusEarly) while this is mounted. We don't bind
// our own Esc listener to avoid the two fighting.
export default function FullscreenDial({
  open,
  pomSeconds,
  pomRunning,
  paused,
  total,
  ringColor,
  activeTask,
  activeGoal,
  onToggleRun,
  onEndEarly,
  onExit,
}) {
  // Lock page scroll while the overlay is up; restore on close. Without
  // this, the scrollbar shows behind the overlay on desktop and the user
  // can accidentally scroll the underlying view on touch.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const prog = total > 0 ? (total - pomSeconds) / total : 0;
  const elapsedSecs = Math.max(0, total - pomSeconds);
  const dialSecs = paused ? elapsedSecs : pomSeconds;

  // Dial geometry — fill the viewport while leaving room for controls.
  // Cap at 560 so we don't get a comically huge ring on ultrawides.
  const DIAL = "min(72vmin, 560px)";
  // The stroke + radius are tied to the SVG viewBox (1000), not to the
  // CSS pixel size — that way the ring stays crisp at any scale.
  const VB = 1000;
  const R = 420;
  const C = 2 * Math.PI * R;
  const STROKE = 36;

  const cat = activeGoal ? CAT_COLORS[activeGoal.category] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--color-background-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        gap: 28,
        overflow: "hidden",
      }}>
      {/* Exit button — pinned top-right so it doesn't sit in the user's
          focus path but is always findable. Keyboard users hit Esc. */}
      <button onClick={onExit}
        aria-label="Exit focus mode"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          fontSize: 13,
          padding: "6px 12px",
          color: "var(--color-text-tertiary)",
          background: "transparent",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 99,
          cursor: "pointer",
        }}>
        Exit · Esc
      </button>

      {/* Dial */}
      <div style={{ position: "relative", width: DIAL, height: DIAL, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          aria-hidden
          className={pomRunning ? "dial-breath" : ""}
          style={{
            position: "absolute",
            inset: "-8%",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${goldA(22)} 0%, transparent 65%)`,
            opacity: pomRunning ? 0.7 : 0.25,
            pointerEvents: "none",
            transition: "opacity 0.4s ease",
          }}
        />
        <svg viewBox={`0 0 ${VB} ${VB}`} width="100%" height="100%"
          role="timer"
          aria-label={paused
            ? `Focus timer paused: ${fmtTime(elapsedSecs)} elapsed, ${fmtTime(pomSeconds)} remaining`
            : `Focus timer ${pomRunning ? "running" : "ready"}: ${fmtTime(pomSeconds)} remaining`}>
          <circle cx={VB / 2} cy={VB / 2} r={R}
            fill="none" stroke="var(--color-background-secondary)" strokeWidth={STROKE} />
          <circle cx={VB / 2} cy={VB / 2} r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - prog)}
            strokeLinecap="round"
            transform={`rotate(-90 ${VB / 2} ${VB / 2})`}
            opacity={paused ? 0.45 : 1}
            style={{ transition: "stroke-dashoffset 0.5s, stroke 0.3s, opacity 0.3s" }} />
          <text x={VB / 2} y={VB / 2 - 20} textAnchor="middle"
            opacity={paused ? 0.85 : 1}
            style={{
              fontSize: 220, fontWeight: 500,
              fill: paused ? "var(--gold)" : "var(--color-text-primary)",
              fontFamily: "monospace",
              transition: "opacity 0.3s, fill 0.3s",
            }}>
            {fmtTime(dialSecs)}
          </text>
          <text x={VB / 2} y={VB / 2 + 90} textAnchor="middle"
            style={{
              fontSize: 50,
              fill: paused ? "var(--color-text-warning)" : "var(--color-text-secondary)",
              letterSpacing: "8px",
              textTransform: "uppercase",
              fontWeight: paused ? 600 : 400,
            }}>
            {paused ? `paused · ${fmtTime(pomSeconds)} left` : "focus"}
          </text>
        </svg>
      </div>

      {/* Task + goal — only when a task is linked. General focus blocks
          stay clean. */}
      {activeTask && activeGoal && (
        <div style={{ textAlign: "center", maxWidth: 560, width: "100%" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>
            Working on
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.4 }}>
            {activeTask.text}
          </div>
          <div style={{ fontSize: 14, color: cat || "var(--gold)", marginTop: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: cat || "var(--gold)", display: "inline-block", marginRight: 7, verticalAlign: "middle" }} />
            {activeGoal.title}
          </div>
          {activeGoal.intention && (
            <div style={{
              marginTop: 16,
              padding: "12px 18px",
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--color-text-primary)",
              background: `linear-gradient(135deg, ${goldA(10)} 0%, ${goldA(3)} 100%)`,
              border: `0.5px solid ${goldA(28)}`,
              borderRadius: "var(--border-radius-md)",
              lineHeight: 1.6,
              display: "inline-block",
              maxWidth: 520,
            }}>
              <span style={{ color: "var(--gold)", fontStyle: "normal", fontWeight: 600, fontSize: 11, letterSpacing: "0.5px", textTransform: "uppercase", marginRight: 8 }}>
                Niyyah
              </span>
              {activeGoal.intention}
            </div>
          )}
        </div>
      )}

      {/* Controls — only what matters mid-session. Reset / pop-out /
          settings live in the regular view. */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={onToggleRun} className="btn-primary" style={{ padding: "12px 36px", fontSize: 16 }}>
          {pomRunning ? "Pause" : paused ? "Resume" : "Bismillah — Start"}
        </button>
        {(pomRunning || paused) && (
          <button onClick={onEndEarly} style={{ fontSize: 15, padding: "11px 22px" }}>
            End focus
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
        Space pause · Esc exit
      </div>
    </div>
  );
}
