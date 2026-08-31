import { useState } from "react";
import { S } from "../../lib/styles";

// Collapsible disclosure for the optional "depth" blocks (yesterday's du'a
// verdict, the goal check, the relational audit). Keeps the nightly form
// from opening as a wall — the five pillars stay visible, the extras tuck
// behind a tappable header. Opens by default when already filled so a
// returning user sees their own entries without hunting.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function Collapsible({ title, accent = "var(--gold)", cardStyle, defaultOpen = false, summary, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ ...S.card, marginBottom: 14, padding: 0, overflow: "hidden", ...cardStyle }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          width: "100%", padding: "12px 16px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: accent, fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase", flexShrink: 0 }}>
            {title}
          </span>
          {!open && summary && (
            <span style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summary}
            </span>
          )}
        </span>
        <span aria-hidden style={{ fontSize: 18, color: "var(--text-muted)", lineHeight: 1, flexShrink: 0, transition: "transform 0.15s ease", transform: open ? "rotate(45deg)" : "none" }}>
          +
        </span>
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}
