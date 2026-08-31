import Section from "./Section";

// Pillar 5 — Shukr (gratitude): three "Alhamdulillah for…" lines.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function ShukrSection({ entry, updateShukr }) {
  return (
    <Section n="5" title="Shukr — Gratitude" hint="Three blessings to thank Allah for." accent="#4f95c9">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map((idx) => (
          <input key={idx} value={(entry.shukr || ["", "", ""])[idx] || ""}
            onChange={(e) => updateShukr(idx, e.target.value)}
            placeholder="Alhamdulillah for…"
            style={{ width: "100%", boxSizing: "border-box" }} />
        ))}
      </div>
    </Section>
  );
}
