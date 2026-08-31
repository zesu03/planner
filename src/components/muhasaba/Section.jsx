import { S } from "../../lib/styles";

// Section wrapper used by all five pillars. The pillar number lives in the
// left-edge colour bar so the page reads as a coloured ladder of sections.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function Section({ n, title, hint, children, accent = "var(--gold)" }) {
  return (
    <div style={{ ...S.card, position: "relative", marginBottom: 14, paddingLeft: 26, overflow: "hidden" }}>
      {/* left-edge accent bar with the pillar number embedded near the top */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          background: accent,
          opacity: 0.85,
        }}
      />
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: hint ? 6 : 12 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          color: accent,
          minWidth: 44,
        }}>
          Pillar {n}
        </div>
        <div className="serif" style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      </div>
      {hint && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>{hint}</div>}
      <div>{children}</div>
    </div>
  );
}
