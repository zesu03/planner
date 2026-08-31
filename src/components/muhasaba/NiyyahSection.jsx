import { NIYYAH_LABELS } from "../../lib/constants";
import { goldA } from "../../lib/styles";
import Section from "./Section";

// Pillar 4 — Niyyah (intention): a 1–5 sincerity rating (tap again to clear)
// plus the "best deed today" the user is most hopeful Allah will accept.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function NiyyahSection({ entry, updateEntry }) {
  return (
    <Section n="4" title="Niyyah — Intention" hint="Were today's actions for Allah, or for something else?" accent="var(--gold)">
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>How sincere was today?</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button"
              onClick={() => updateEntry({ niyyahRating: entry.niyyahRating === n ? 0 : n })}
              style={{
                fontSize: 13, padding: "6px 11px", borderRadius: "var(--border-radius-md)",
                cursor: "pointer", minWidth: 34,
                background: entry.niyyahRating === n ? goldA(22) : "var(--color-background-secondary)",
                border: `0.5px solid ${entry.niyyahRating === n ? "var(--gold)" : "var(--color-border-tertiary)"}`,
                color: entry.niyyahRating === n ? "var(--gold)" : "var(--text-secondary)",
                fontWeight: entry.niyyahRating === n ? 600 : 400,
              }}>
              {n}
            </button>
          ))}
          {entry.niyyahRating > 0 && (
            <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center", marginLeft: 6 }}>
              {NIYYAH_LABELS[entry.niyyahRating]}
            </span>
          )}
        </div>
      </div>
      <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Best deed today</label>
      <input value={entry.bestDeed}
        onChange={(e) => updateEntry({ bestDeed: e.target.value })}
        placeholder="The act I'm most hopeful Allah will accept."
        style={{ width: "100%", boxSizing: "border-box" }} />
    </Section>
  );
}
