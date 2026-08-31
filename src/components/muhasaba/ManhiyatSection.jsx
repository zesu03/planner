import { SIN_TAGS } from "../../lib/constants";
import { RELATION_OPTIONS } from "../../lib/muhasaba";
import Section from "./Section";

// Pillar 2 — Manhiyat (forbidden acts): repentance text + optional sin tags,
// the relational audit ("who did I owe today?"), and the tawbah conditions
// (shown only once something to repent has been named).
// (Moved out of views/Muhasaba.jsx during the Phase 5 modular refactor.)
export default function ManhiyatSection({ entry, updateEntry, toggleSinTag, toggleRelation, updateRelationNote }) {
  return (
    <Section n="2" title="Manhiyat — Forbidden acts" hint="Repent sincerely, with the intention not to return." accent="#d4744a">
      <textarea rows={3} value={entry.repentText}
        onChange={(e) => updateEntry({ repentText: e.target.value })}
        placeholder="What do I seek Allah's forgiveness for today?"
        style={{ width: "100%", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Tag (optional):</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {SIN_TAGS.map((tag) => {
          const active = (entry.sinTags || []).includes(tag);
          return (
            <button key={tag} type="button" onClick={() => toggleSinTag(tag)}
              style={{
                fontSize: 13, padding: "4px 11px", borderRadius: 99, cursor: "pointer",
                background: active ? "rgba(216,90,48,0.18)" : "var(--color-background-secondary)",
                border: `0.5px solid ${active ? "#d4744a" : "var(--color-border-tertiary)"}`,
                color: active ? "#E88B7C" : "var(--text-secondary)",
              }}>
              {tag}
            </button>
          );
        })}
      </div>

      {/* Relational audit — the half of muhasaba that's usually missing
          from journaling apps. You can't repair what you haven't named.
          Tap a relation to mark it owes attention; the note below is
          where you write what specifically + what you'll do. */}
      <div style={{
        marginTop: 4, paddingTop: 14,
        borderTop: "0.5px dashed var(--color-border-tertiary)",
      }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, marginBottom: 4 }}>
          Who did I owe today?
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontStyle: "italic" }}>
          "Rights are two: rights of Allah, and rights of His creation." — name where to repair, then do it.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {RELATION_OPTIONS.map((r) => {
            const active = Object.prototype.hasOwnProperty.call(entry.relations || {}, r.slug);
            const isAllah = r.slug === "allah";
            const activeColor = isAllah ? "var(--gold)" : "#d4744a";
            const activeBg = isAllah ? "rgba(201,168,76,0.18)" : "rgba(216,90,48,0.18)";
            return (
              <button key={r.slug} type="button" onClick={() => toggleRelation(r.slug)}
                aria-pressed={active}
                style={{
                  fontSize: 13, padding: "4px 11px", borderRadius: 99, cursor: "pointer",
                  background: active ? activeBg : "var(--color-background-secondary)",
                  border: `0.5px solid ${active ? activeColor : "var(--color-border-tertiary)"}`,
                  color: active ? activeColor : "var(--text-secondary)",
                  fontWeight: active ? 600 : 400,
                }}>
                {r.label}
              </button>
            );
          })}
        </div>
        {/* Per-selected-relation notes. Each selected chip gets its own
            textarea so the user names the specific debt + repair plan. */}
        {Object.keys(entry.relations || {}).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(entry.relations || {}).map(([slug, note]) => {
              const meta = RELATION_OPTIONS.find((r) => r.slug === slug) || { label: slug };
              const isAllah = slug === "allah";
              const accent = isAllah ? "var(--gold)" : "#d4744a";
              return (
                <div key={slug} style={{
                  padding: "10px 12px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  borderLeft: `3px solid ${accent}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: accent, marginBottom: 4, letterSpacing: "0.3px", textTransform: "uppercase" }}>
                    {meta.label}
                  </div>
                  <textarea rows={2} value={note}
                    onChange={(e) => updateRelationNote(slug, e.target.value)}
                    placeholder={
                      isAllah ? "What did I owe Allah today, and what will I do tomorrow?" :
                                 "What specifically? What's my next step to repair?"
                    }
                    style={{ width: "100%", resize: "vertical", boxSizing: "border-box", background: "var(--bg-card)" }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tawbah conditions — only appears when the user has named
          something to repent. Three affirmations the user taps
          consciously; the act of tapping is part of the practice.
          Classical condition #4 (regret) is implicit in writing
          repentText at all — so we show three, not four. */}
      {((entry.repentText && entry.repentText.trim()) || (entry.sinTags || []).length > 0) && (() => {
        const t = entry.tawbah || { stopped: false, resolved: false, restored: false };
        const setT = (key, val) => updateEntry({ tawbah: { ...t, [key]: val } });
        const items = [
          { key: "stopped",  label: "I have stopped — this is not ongoing right now." },
          { key: "resolved", label: "I resolve not to return — by means and avoidance, not just words." },
          { key: "restored", label: "I have repaired what I can — or no human right is owed." },
        ];
        return (
          <div style={{
            marginTop: 14,
            padding: "12px 14px",
            background: "rgba(216,90,48,0.06)",
            borderRadius: "var(--border-radius-md)",
            borderLeft: "3px solid rgba(216,90,48,0.55)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#d4744a", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>
              Tawbah · the four conditions
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, fontStyle: "italic", lineHeight: 1.5 }}>
              "And turn to Allah in repentance, all of you, O believers, that you may succeed." — Quran 24:31
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(({ key, label }) => {
                const checked = !!t[key];
                return (
                  <label key={key} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    cursor: "pointer", fontSize: 14, lineHeight: 1.5,
                    padding: "6px 8px", borderRadius: 8,
                    background: checked ? "rgba(216,90,48,0.10)" : "transparent",
                    transition: "background 0.15s ease",
                  }}>
                    <input type="checkbox" checked={checked}
                      onChange={(e) => setT(key, e.target.checked)}
                      style={{ width: 16, height: 16, marginTop: 3, cursor: "pointer", accentColor: "#d4744a", flexShrink: 0 }} />
                    <span style={{ color: checked ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: checked ? 500 : 400 }}>
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })()}
    </Section>
  );
}
