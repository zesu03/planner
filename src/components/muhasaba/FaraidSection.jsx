import { PRAYERS, VOLUNTARY_PRAYERS, PRAYER_COLORS } from "../../lib/constants";
import { PrayerIcon } from "../icons";
import { goldA, S } from "../../lib/styles";
import Section from "./Section";

// Pillar 1 — Fara'id (obligations): the day's fard + voluntary prayer pills
// (auto from prayerLog), Quran/dhikr entry, and a make-up plan note.
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function FaraidSection({ entry, updateEntry, dayPrayersDone, dayVoluntaryDone }) {
  return (
    <Section n="1" title="Fara'id — Obligations" hint="The first thing accounted for on the Day of Judgement is the prayer." accent="#3faa7e">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {PRAYERS.map((p) => {
          const done = dayPrayersDone.includes(p);
          const pColor = PRAYER_COLORS[p];
          return (
            <span key={p} style={{
              ...S.pill(done ? pColor + "22" : "var(--color-background-secondary)", done ? pColor : "var(--text-muted)"),
              border: `0.5px solid ${done ? pColor + "66" : "transparent"}`,
              display: "inline-flex", alignItems: "center", gap: 5,
              opacity: done ? 1 : 0.6,
            }}>
              <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 4 }}><PrayerIcon name={p} size={15} /></span>{p}{done && <span> ✓</span>}
            </span>
          );
        })}
      </div>

      {/* Voluntary night prayer (Tahajjud and any other nafl) — quiet
          line below the fard pills, so the user sees their voluntary
          effort alongside the obligations when reviewing the day. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 14, fontSize: 13 }}>
        <span style={{ color: "var(--text-muted)", letterSpacing: "0.3px" }}>Voluntary:</span>
        {VOLUNTARY_PRAYERS.map((p) => {
          const done = dayVoluntaryDone.includes(p);
          const pColor = PRAYER_COLORS[p] || "var(--gold)";
          return (
            <span key={p} style={{
              ...S.pill(done ? pColor + "22" : "transparent", done ? pColor : "var(--text-muted)"),
              border: `0.5px solid ${done ? pColor + "66" : "var(--color-border-tertiary)"}`,
              display: "inline-flex", alignItems: "center", gap: 5,
              opacity: done ? 1 : 0.7,
            }}>
              <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 4 }}><PrayerIcon name={p} size={15} /></span>{p}{done && <span> ✓</span>}
            </span>
          );
        })}
        {dayVoluntaryDone.length === 0 && (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            none tonight — Tahajjud is in the last third of the night
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Quran today (pages / ayat)</label>
          <input value={entry.quranPages} onChange={(e) => updateEntry({ quranPages: e.target.value })}
            placeholder="e.g. 2 pages, Surah Mulk v.1-10"
            style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
        <label style={{
          display: "flex", alignItems: "center", gap: 7, fontSize: 14,
          color: "var(--text-secondary)", cursor: "pointer",
          padding: "10px 12px", background: "var(--color-background-secondary)",
          border: `0.5px solid ${entry.dhikr ? goldA(60) : "var(--color-border-tertiary)"}`,
          borderRadius: "var(--border-radius-md)",
        }}>
          <input type="checkbox" checked={!!entry.dhikr}
            onChange={(e) => updateEntry({ dhikr: e.target.checked })}
            style={{ width: "auto", margin: 0 }} />
          Dhikr today
        </label>
      </div>
      <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Did I miss anything? Make-up plan</label>
      <textarea rows={2} value={entry.makeupNote}
        onChange={(e) => updateEntry({ makeupNote: e.target.value })}
        placeholder="e.g. missed Asr — qaza after Maghrib."
        style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }} />
    </Section>
  );
}
