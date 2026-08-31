import { fmtMins } from "../../lib/focus";
import { S } from "../../lib/styles";
import Section from "./Section";

// Pillar 3 — Ghaflah (heedlessness): today's focus minutes (auto from the
// focus log) + a free-text note on where time went.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function GhaflahSection({ entry, updateEntry, dayFocusMins }) {
  return (
    <Section n="3" title="Ghaflah — Heedlessness & distractions" hint="Time spent in non-beneficial things." accent="#8378d0">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={S.pill("rgba(131,120,208,0.18)", "#8378d0")}>Focus today: {fmtMins(dayFocusMins)}</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>(auto from focus log)</span>
      </div>
      <textarea rows={3} value={entry.ghaflahNote}
        onChange={(e) => updateEntry({ ghaflahNote: e.target.value })}
        placeholder="Where did my time go? What will I replace it with tomorrow?"
        style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }} />
    </Section>
  );
}
