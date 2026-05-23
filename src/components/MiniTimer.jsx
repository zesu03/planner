import { useEffect, useRef, useState } from "react";
import { fmtTime } from "../lib/focus";

// Compact dial + time for the Picture-in-Picture pop-out. Same paused /
// running / idle semantics as the main Pomodoro dial — when paused, the
// big number flips from countdown to elapsed (Windows-stopwatch style).
//
// Layout adapts to the window dimensions so the dial stays visible even
// when the user shrinks the pop-out to Chrome's minimum size:
//   - tall enough → column: dial on top, button below
//   - short → row: dial on the left, button on the right
// The breakpoint is height-based and watched via matchMedia inside the
// PiP window so resizes flip the layout live.
export default function MiniTimer({ pomSeconds, pomRunning, total, ringColor = "var(--gold)", onToggle }) {
  const prog = total > 0 ? (total - pomSeconds) / total : 0;
  const paused = !pomRunning && prog > 0 && prog < 1;
  const elapsedSecs = Math.max(0, total - pomSeconds);
  const dialSecs = paused ? elapsedSecs : pomSeconds;

  const rootRef = useRef(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const view = node.ownerDocument.defaultView || window;
    const mql = view.matchMedia("(max-height: 180px)");
    const apply = () => setCompact(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  // viewBox-relative units. Everything renders into a 220×220 canvas which
  // then scales to fit whatever space the parent gives the SVG.
  const VB = 220;
  const R = 90;
  const C = 2 * Math.PI * R;

  return (
    <div ref={rootRef} style={{
      display: "flex",
      flexDirection: compact ? "row" : "column",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 10 : 8,
      padding: compact ? 6 : 10,
      width: "100vw",
      height: "100vh",
      boxSizing: "border-box",
      overflow: "hidden",
    }}>
      <div style={{
        flex: "1 1 0",
        minWidth: 0,
        minHeight: 0,
        width: compact ? "auto" : "100%",
        height: compact ? "100%" : "auto",
        aspectRatio: "1 / 1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "100%" }}>
          <circle cx={VB / 2} cy={VB / 2} r={R}
            fill="none" stroke="var(--color-background-secondary)" strokeWidth="10" />
          <circle cx={VB / 2} cy={VB / 2} r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="10"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - prog)}
            strokeLinecap="round"
            transform={`rotate(-90 ${VB / 2} ${VB / 2})`}
            opacity={paused ? 0.45 : 1}
            style={{ transition: "stroke-dashoffset 0.5s, opacity 0.3s" }} />
          <text x={VB / 2} y={VB / 2 - 4} textAnchor="middle"
            style={{ fontSize: 42, fontWeight: 500, fill: paused ? "var(--gold)" : "var(--color-text-primary)", fontFamily: "monospace" }}>
            {fmtTime(dialSecs)}
          </text>
          {!compact && (
            <text x={VB / 2} y={VB / 2 + 24} textAnchor="middle"
              style={{ fontSize: 12, fill: paused ? "var(--color-text-warning)" : "var(--color-text-secondary)", letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: paused ? 600 : 400 }}>
              {paused ? `paused · ${fmtTime(pomSeconds)} left` : "focus"}
            </text>
          )}
        </svg>
      </div>
      <button onClick={onToggle} className="btn-primary"
        style={{
          padding: compact ? "5px 14px" : "6px 22px",
          fontSize: compact ? 12 : 13,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
        {pomRunning ? "Pause" : paused ? "Resume" : "Start"}
      </button>
    </div>
  );
}
