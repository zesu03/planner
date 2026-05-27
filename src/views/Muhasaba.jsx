import { useState } from "react";
import {
  PRAYERS,
  VOLUNTARY_PRAYERS,
  PRAYER_ICONS,
  PRAYER_COLORS,
  SIN_TAGS,
  NIYYAH_LABELS,
} from "../lib/constants";
import { fmt, todayStr, addDays, localDateStr, TIMEZONE } from "../lib/dates";
import { fmtMins } from "../lib/focus";
import {
  emptyMuhasabaEntry,
  isMuhasabaFilled,
  muhasabaStreak,
  canGenerateMirror,
  RELATION_OPTIONS,
} from "../lib/muhasaba";
import { goldA, S } from "../lib/styles";
import Modal from "../components/Modal";

// Renders the AI Mirror report. Handles both shapes:
//   - new: report.data = { summary, pushBack?, scriptureAnchor?, tomorrow, patterns? }
//   - legacy: report.text = "<prose>... Tomorrow: ..."  (regex-extracted)
// Caller is responsible for the surrounding card chrome.
function MirrorContent({ report }) {
  // Structured path
  if (report?.data) {
    const d = report.data;
    return (
      <>
        {d.summary && (
          <div style={{ fontSize: 15, color: "var(--color-text-primary)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {d.summary}
          </div>
        )}

        {d.pushBack && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: "var(--border-radius-md)",
            background: "var(--color-background-warning)",
            border: "0.5px solid rgba(214,168,95,0.4)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 11, color: "var(--color-text-warning)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0, paddingTop: 2 }}>
              Look here →
            </span>
            <span style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.5 }}>
              {d.pushBack}
            </span>
          </div>
        )}

        {d.scriptureAnchor && (
          <div style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: "var(--border-radius-md)",
            background: `linear-gradient(135deg, ${goldA(10)} 0%, ${goldA(3)} 100%)`,
            border: `0.5px solid ${goldA(32)}`,
          }}>
            <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>
              {d.scriptureAnchor.ref || "Scripture"}
            </div>
            {d.scriptureAnchor.text && (
              <div style={{ fontSize: 14, color: "var(--color-text-primary)", fontStyle: "italic", lineHeight: 1.55, marginBottom: 6 }}>
                "{d.scriptureAnchor.text}"
              </div>
            )}
            {d.scriptureAnchor.why && (
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                {d.scriptureAnchor.why}
              </div>
            )}
          </div>
        )}

        {d.tomorrow && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: "var(--border-radius-md)",
            background: `linear-gradient(135deg, ${goldA(16)} 0%, ${goldA(6)} 100%)`,
            border: `0.5px solid ${goldA(36)}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0, paddingTop: 2 }}>
              Tomorrow →
            </span>
            <span style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.5, fontWeight: 500 }}>
              {d.tomorrow}
            </span>
          </div>
        )}

        {Array.isArray(d.patterns) && d.patterns.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "0.5px dashed var(--color-border-tertiary)" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>
              Patterns observed
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.patterns.map((p, i) => (
                <div key={i} style={{
                  fontSize: 13,
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.45,
                  padding: "6px 10px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                }}>
                  <span style={{ color: "var(--gold)", fontWeight: 600, marginRight: 6 }}>
                    {p.label || p.kind}:
                  </span>
                  {p.comment}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // Legacy text-only path — extract closing Tomorrow: line via regex
  if (report?.text) {
    const m = report.text.match(/^([\s\S]*?)\s*Tomorrow\s*[:\-—]\s*([\s\S]+?)\s*$/i);
    const body = m ? m[1].trim() : report.text;
    const tomorrow = m ? m[2].trim() : null;
    return (
      <>
        <div style={{ fontSize: 15, color: "var(--color-text-primary)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {body}
        </div>
        {tomorrow && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: "var(--border-radius-md)",
            background: `linear-gradient(135deg, ${goldA(16)} 0%, ${goldA(6)} 100%)`,
            border: `0.5px solid ${goldA(36)}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0, paddingTop: 2 }}>
              Tomorrow →
            </span>
            <span style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.5, fontWeight: 500 }}>
              {tomorrow}
            </span>
          </div>
        )}
      </>
    );
  }
  return null;
}

// Helper for previews — Dashboard teaser, history list. Returns plain text.
export function reportPreviewText(report) {
  if (!report) return null;
  return report.data?.summary || report.text || null;
}

// Section wrapper used by all five pillars. The pillar number lives in the
// left-edge colour bar so the page reads as a coloured ladder of sections.
function Section({ n, title, hint, children, accent = "var(--gold)" }) {
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
        <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
      </div>
      {hint && <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 12 }}>{hint}</div>}
      <div>{children}</div>
    </div>
  );
}

export default function Muhasaba({
  muhasaba,
  muhasabaDay,
  setMuhasabaDay,
  applyMuhasabaUpdate,
  prayerLog,
  focusLog,
  goals,
  aiLoadingDay,
  aiError,
  generateReport,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOpenDay, setHistoryOpenDay] = useState(null);
  const day = muhasabaDay;
  const entry = muhasaba[day] || emptyMuhasabaEntry();
  const isToday = day === todayStr();

  const updateEntry = (patch) => {
    applyMuhasabaUpdate((m) => ({
      ...m,
      [day]: { ...emptyMuhasabaEntry(), ...m[day], ...patch, updatedAt: new Date().toISOString() },
    }));
  };
  const toggleSinTag = (tag) => {
    const cur = entry.sinTags || [];
    updateEntry({ sinTags: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] });
  };

  // Relational audit helpers. Toggle adds/removes a relation slug from the
  // entry's `relations` map (key present = selected). Note edit replaces
  // the value at that slug. We preserve the existing note when toggling
  // off-then-on within the same session would lose the note, so toggling
  // off clears the key entirely — the user can recreate it.
  const toggleRelation = (slug) => {
    const cur = entry.relations || {};
    const next = { ...cur };
    if (Object.prototype.hasOwnProperty.call(next, slug)) delete next[slug];
    else next[slug] = "";
    updateEntry({ relations: next });
  };
  const updateRelationNote = (slug, text) => {
    const cur = entry.relations || {};
    updateEntry({ relations: { ...cur, [slug]: text } });
  };

  // Per-active-goal nightly self-check. Tapping the same value twice
  // toggles it off (back to unset) so the user can clear a misclick.
  const setGoalCheck = (goalId, value) => {
    const cur = entry.goalChecks || {};
    const next = { ...cur };
    if (cur[goalId] === value) delete next[goalId];
    else next[goalId] = value;
    updateEntry({ goalChecks: next });
  };
  const updateShukr = (idx, val) => {
    const next = [...(entry.shukr || ["", "", ""])];
    next[idx] = val;
    updateEntry({ shukr: next });
  };

  // auto-fills for the selected day
  const dayPrayersDone = PRAYERS.filter((p) => (prayerLog[p] || []).includes(day));
  const dayVoluntaryDone = VOLUNTARY_PRAYERS.filter((p) => (prayerLog[p] || []).includes(day));
  const dayFocusMins = focusLog.filter((l) => l.day === day).reduce((s, l) => s + (l.mins || 0), 0);
  const streak = muhasabaStreak(muhasaba);

  // last 14 days strip — anchored to IST so the rightmost cell is always
  // today in the user's calendar, not UTC.
  const stripDays = [];
  for (let i = 13; i >= 0; i--) stripDays.push(addDays(-i));

  // Render labels using the device's local timezone so weekday/day numerals
  // match the YYYY-MM-DD key. UTC-anchored Date + matching timezone format.
  const dInfo = new Date(`${day}T00:00:00Z`);
  const dayLabel = dInfo.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: TIMEZONE,
  });
  const yesterdayDuaKey = (() => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return localDateStr(d);
  })();
  const yesterdayDua = muhasaba[yesterdayDuaKey]?.duaTomorrow;

  const filled = isMuhasabaFilled(entry);
  const canGenerate = canGenerateMirror(entry, day, prayerLog, focusLog);
  const report = entry.aiReport;
  const generating = aiLoadingDay === day;

  return (
    <div className="view-content">
      {/* Header / streak */}
      <div style={{ ...S.goldCard, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
              محاسبة النفس · Muhasaba
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {isToday ? "Tonight's reckoning" : dayLabel}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 3, fontStyle: "italic" }}>
              "Hold yourselves accountable before you are held accountable." — ʿUmar ibn al-Khattab
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "var(--gold)" }}>{streak}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>day streak</div>
          </div>
        </div>
      </div>

      {/* Day picker strip */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 6 }}>
        {stripDays.map((d) => {
          const isFilled = isMuhasabaFilled(muhasaba[d]);
          const active = d === day;
          // Anchor at UTC midnight + format in device-local timezone so the
          // visible weekday/day-numeral labels stay consistent with the
          // YYYY-MM-DD key (which is itself a local-zone date).
          const dt = new Date(`${d}T00:00:00Z`);
          const weekday = dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: TIMEZONE });
          const dayNum = Number(d.split("-")[2]);
          return (
            <button key={d} onClick={() => setMuhasabaDay(d)}
              style={{
                flexShrink: 0,
                minWidth: 48,
                padding: "7px 4px",
                borderRadius: "var(--border-radius-md)",
                background: active ? goldA(18) : "var(--color-background-secondary)",
                border: `0.5px solid ${active ? goldA(60) : "var(--color-border-tertiary)"}`,
                color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
              }}>
              <span style={{ fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>
                {weekday}
              </span>
              <span style={{ fontSize: 15, fontWeight: active ? 600 : 500 }}>{dayNum}</span>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: isFilled ? "var(--gold)" : "transparent" }} />
            </button>
          );
        })}
      </div>

      {/* Yesterday's du'a → today's verdict. The user wrote a commitment
          last night; tonight they answer honestly: honoured, partial, or
          missed. This is the loop that turns daily reflection into actual
          behavioural feedback. */}
      {yesterdayDua && (() => {
        const dc = entry.duaCheck || { status: null, note: "" };
        const STATUSES = [
          { value: "honoured", label: "Honoured", color: "var(--color-text-success)", bg: "var(--color-background-success)" },
          { value: "partial",  label: "Partial",  color: "var(--color-text-warning)", bg: "var(--color-background-warning)" },
          { value: "missed",   label: "Missed",   color: "var(--color-text-danger)",  bg: "var(--color-background-danger)" },
        ];
        const setStatus = (next) => {
          const nextStatus = dc.status === next ? null : next; // toggle off
          updateEntry({ duaCheck: { status: nextStatus, note: dc.note || "" } });
        };
        const setNote = (text) => {
          updateEntry({ duaCheck: { status: dc.status, note: text } });
        };
        return (
          <div style={{ ...S.card, marginBottom: 14, background: "rgba(63,140,160,0.08)", borderColor: "rgba(63,140,160,0.32)" }}>
            <div style={{ fontSize: 12, color: "#7BB6C7", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 5 }}>
              Yesterday's du'a — today is its test
            </div>
            <div style={{ fontSize: 15, color: "var(--color-text-primary)", fontStyle: "italic", marginBottom: 12 }}>
              "{yesterdayDua}"
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: dc.status ? 10 : 0 }}>
              {STATUSES.map((s) => {
                const active = dc.status === s.value;
                return (
                  <button key={s.value} type="button" onClick={() => setStatus(s.value)}
                    aria-pressed={active}
                    style={{
                      fontSize: 13, padding: "5px 12px", borderRadius: 99, cursor: "pointer",
                      background: active ? s.bg : "var(--color-background-secondary)",
                      border: `0.5px solid ${active ? s.color : "var(--color-border-tertiary)"}`,
                      color: active ? s.color : "var(--color-text-secondary)",
                      fontWeight: active ? 600 : 400,
                    }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
            {dc.status && (
              <textarea rows={2} value={dc.note || ""}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  dc.status === "honoured" ? "How did Allah make it easy? What turned the tide?" :
                  dc.status === "partial"  ? "What helped, what got in the way?" :
                                             "What happened? What will I do differently?"
                }
                style={{ width: "100%", resize: "vertical", boxSizing: "border-box", marginTop: 2 }} />
            )}
          </div>
        );
      })()}

      {/* Goals → Muhasaba — nightly self-check per active goal. Closes the
          loop between the user's stated commitments (Goals tab) and tonight's
          honest verdict. Three values per goal: yes / partial / no. Unset =
          user hasn't answered for that goal yet. */}
      {(() => {
        const activeGoals = (goals || []).filter((g) => !g.completedAt);
        if (activeGoals.length === 0) return null;
        const checks = entry.goalChecks || {};
        return (
          <div style={{ ...S.card, marginBottom: 14, background: "rgba(127,119,221,0.05)", borderColor: "rgba(127,119,221,0.28)" }}>
            <div style={{ fontSize: 12, color: "#9B92F2", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
              Tonight's goal check
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12, fontStyle: "italic", lineHeight: 1.5 }}>
              Did the day move your stated niyyahs forward? Be honest — drift is harder to repair the longer you avoid naming it.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeGoals.map((g) => {
                const value = checks[g.id]; // "yes" | "partial" | "no" | undefined
                const STATUSES = [
                  { v: "yes",     label: "Yes",     color: "var(--color-text-success)", bg: "var(--color-background-success)" },
                  { v: "partial", label: "Partial", color: "var(--color-text-warning)", bg: "var(--color-background-warning)" },
                  { v: "no",      label: "No",      color: "var(--color-text-danger)",  bg: "var(--color-background-danger)" },
                ];
                return (
                  <div key={g.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px",
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                    flexWrap: "wrap",
                  }}>
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.title}
                      </div>
                      {g.intention && (
                        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.intention}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {STATUSES.map((s) => {
                        const active = value === s.v;
                        return (
                          <button key={s.v} type="button" onClick={() => setGoalCheck(g.id, s.v)}
                            aria-pressed={active}
                            style={{
                              fontSize: 12, padding: "4px 10px", borderRadius: 99, cursor: "pointer",
                              background: active ? s.bg : "transparent",
                              border: `0.5px solid ${active ? s.color : "var(--color-border-tertiary)"}`,
                              color: active ? s.color : "var(--color-text-secondary)",
                              fontWeight: active ? 600 : 400,
                            }}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 1. Fara'id */}
      <Section n="1" title="Fara'id — Obligations" hint="The first thing accounted for on the Day of Judgement is the prayer." accent="#1D9E75">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {PRAYERS.map((p) => {
            const done = dayPrayersDone.includes(p);
            const pColor = PRAYER_COLORS[p];
            return (
              <span key={p} style={{
                ...S.pill(done ? pColor + "22" : "var(--color-background-secondary)", done ? pColor : "var(--color-text-tertiary)"),
                border: `0.5px solid ${done ? pColor + "66" : "transparent"}`,
                display: "inline-flex", alignItems: "center", gap: 5,
                opacity: done ? 1 : 0.6,
              }}>
                <span>{PRAYER_ICONS[p]}</span>{p}{done && <span> ✓</span>}
              </span>
            );
          })}
        </div>

        {/* Voluntary night prayer (Tahajjud and any other nafl) — quiet
            line below the fard pills, so the user sees their voluntary
            effort alongside the obligations when reviewing the day. */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 14, fontSize: 13 }}>
          <span style={{ color: "var(--color-text-tertiary)", letterSpacing: "0.3px" }}>Voluntary:</span>
          {VOLUNTARY_PRAYERS.map((p) => {
            const done = dayVoluntaryDone.includes(p);
            const pColor = PRAYER_COLORS[p] || "var(--gold)";
            return (
              <span key={p} style={{
                ...S.pill(done ? pColor + "22" : "transparent", done ? pColor : "var(--color-text-tertiary)"),
                border: `0.5px solid ${done ? pColor + "66" : "var(--color-border-tertiary)"}`,
                display: "inline-flex", alignItems: "center", gap: 5,
                opacity: done ? 1 : 0.7,
              }}>
                <span>{PRAYER_ICONS[p]}</span>{p}{done && <span> ✓</span>}
              </span>
            );
          })}
          {dayVoluntaryDone.length === 0 && (
            <span style={{ color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
              none tonight — Tahajjud is in the last third of the night
            </span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Quran today (pages / ayat)</label>
            <input value={entry.quranPages} onChange={(e) => updateEntry({ quranPages: e.target.value })}
              placeholder="e.g. 2 pages, Surah Mulk v.1-10"
              style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <label style={{
            display: "flex", alignItems: "center", gap: 7, fontSize: 14,
            color: "var(--color-text-secondary)", cursor: "pointer",
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
        <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Did I miss anything? Make-up plan</label>
        <textarea rows={2} value={entry.makeupNote}
          onChange={(e) => updateEntry({ makeupNote: e.target.value })}
          placeholder="e.g. missed Asr — qaza after Maghrib."
          style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }} />
      </Section>

      {/* 2. Manhiyat */}
      <Section n="2" title="Manhiyat — Forbidden acts" hint="Repent sincerely, with the intention not to return." accent="#D85A30">
        <textarea rows={3} value={entry.repentText}
          onChange={(e) => updateEntry({ repentText: e.target.value })}
          placeholder="What do I seek Allah's forgiveness for today?"
          style={{ width: "100%", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Tag (optional):</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {SIN_TAGS.map((tag) => {
            const active = (entry.sinTags || []).includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggleSinTag(tag)}
                style={{
                  fontSize: 13, padding: "4px 11px", borderRadius: 99, cursor: "pointer",
                  background: active ? "rgba(216,90,48,0.18)" : "var(--color-background-secondary)",
                  border: `0.5px solid ${active ? "#D85A30" : "var(--color-border-tertiary)"}`,
                  color: active ? "#E88B7C" : "var(--color-text-secondary)",
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
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500, marginBottom: 4 }}>
            Who did I owe today?
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 8, fontStyle: "italic" }}>
            "Rights are two: rights of Allah, and rights of His creation." — name where to repair, then do it.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {RELATION_OPTIONS.map((r) => {
              const active = Object.prototype.hasOwnProperty.call(entry.relations || {}, r.slug);
              const isAllah = r.slug === "allah";
              const activeColor = isAllah ? "var(--gold)" : "#D85A30";
              const activeBg = isAllah ? "rgba(201,168,76,0.18)" : "rgba(216,90,48,0.18)";
              return (
                <button key={r.slug} type="button" onClick={() => toggleRelation(r.slug)}
                  aria-pressed={active}
                  style={{
                    fontSize: 13, padding: "4px 11px", borderRadius: 99, cursor: "pointer",
                    background: active ? activeBg : "var(--color-background-secondary)",
                    border: `0.5px solid ${active ? activeColor : "var(--color-border-tertiary)"}`,
                    color: active ? activeColor : "var(--color-text-secondary)",
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
                const accent = isAllah ? "var(--gold)" : "#D85A30";
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
                      style={{ width: "100%", resize: "vertical", boxSizing: "border-box", background: "var(--color-background-primary)" }} />
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
              <div style={{ fontSize: 12, fontWeight: 700, color: "#D85A30", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>
                Tawbah · the four conditions
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12, fontStyle: "italic", lineHeight: 1.5 }}>
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
                        style={{ width: 16, height: 16, marginTop: 3, cursor: "pointer", accentColor: "#D85A30", flexShrink: 0 }} />
                      <span style={{ color: checked ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: checked ? 500 : 400 }}>
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

      {/* 3. Ghaflah */}
      <Section n="3" title="Ghaflah — Heedlessness & distractions" hint="Time spent in non-beneficial things." accent="#7F77DD">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={S.pill("rgba(127,119,221,0.18)", "#9B92F2")}>Focus today: {fmtMins(dayFocusMins)}</span>
          <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>(auto from focus log)</span>
        </div>
        <textarea rows={3} value={entry.ghaflahNote}
          onChange={(e) => updateEntry({ ghaflahNote: e.target.value })}
          placeholder="Where did my time go? What will I replace it with tomorrow?"
          style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }} />
      </Section>

      {/* 4. Niyyah */}
      <Section n="4" title="Niyyah — Intention" hint="Were today's actions for Allah, or for something else?" accent="var(--gold)">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>How sincere was today?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button"
                onClick={() => updateEntry({ niyyahRating: entry.niyyahRating === n ? 0 : n })}
                style={{
                  fontSize: 13, padding: "6px 11px", borderRadius: "var(--border-radius-md)",
                  cursor: "pointer", minWidth: 34,
                  background: entry.niyyahRating === n ? goldA(22) : "var(--color-background-secondary)",
                  border: `0.5px solid ${entry.niyyahRating === n ? "var(--gold)" : "var(--color-border-tertiary)"}`,
                  color: entry.niyyahRating === n ? "var(--gold)" : "var(--color-text-secondary)",
                  fontWeight: entry.niyyahRating === n ? 600 : 400,
                }}>
                {n}
              </button>
            ))}
            {entry.niyyahRating > 0 && (
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", alignSelf: "center", marginLeft: 6 }}>
                {NIYYAH_LABELS[entry.niyyahRating]}
              </span>
            )}
          </div>
        </div>
        <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Best deed today</label>
        <input value={entry.bestDeed}
          onChange={(e) => updateEntry({ bestDeed: e.target.value })}
          placeholder="The act I'm most hopeful Allah will accept."
          style={{ width: "100%", boxSizing: "border-box" }} />
      </Section>

      {/* 5. Shukr */}
      <Section n="5" title="Shukr — Gratitude" hint="Three blessings to thank Allah for." accent="#378ADD">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2].map((idx) => (
            <input key={idx} value={(entry.shukr || ["", "", ""])[idx] || ""}
              onChange={(e) => updateShukr(idx, e.target.value)}
              placeholder="Alhamdulillah for…"
              style={{ width: "100%", boxSizing: "border-box" }} />
          ))}
        </div>
      </Section>

      {/* Du'a for tomorrow */}
      <div style={{ ...S.goldCard, marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 6 }}>
          Du'a / commitment for tomorrow
        </div>
        <textarea rows={2} value={entry.duaTomorrow}
          onChange={(e) => updateEntry({ duaTomorrow: e.target.value })}
          placeholder="One specific thing I'm asking Allah for tomorrow."
          style={{ width: "100%", resize: "vertical", boxSizing: "border-box", background: "rgba(0,0,0,0.2)" }} />
      </div>

      {/* AI reflection */}
      {!canGenerate && !report && !generating ? (
        <div style={{
          ...S.card, marginBottom: 14, textAlign: "center",
          padding: "20px 16px", borderStyle: "dashed",
          borderColor: "var(--color-border-tertiary)",
        }}>
          <div style={{ fontSize: 30, marginBottom: 6, opacity: 0.7 }}>🪞</div>
          <div style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500, marginBottom: 3 }}>
            The mirror needs something to read
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            Log a prayer, run a focus session, or fill any section above — then a candid mentor's note unlocks.
          </div>
        </div>
      ) : (
        <div style={{ ...S.card, marginBottom: 14, borderColor: "var(--color-border-secondary)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                The mirror · candid reflection
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 3 }}>
                {report
                  ? `Generated ${new Date(report.generatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}${report.model ? ` · ${report.model}` : ""}`
                  : filled
                    ? "Hold yourself to your own niyyah, not your own comfort."
                    : "Reflection will be sharper if you fill the sections above first."}
              </div>
            </div>
            <button onClick={() => generateReport(day, { force: true })}
              disabled={generating || !canGenerate}
              style={{ fontSize: 13, padding: "5px 12px" }}>
              {generating ? "Generating…" : report ? "Regenerate" : "Generate"}
            </button>
          </div>
          {generating && (
            <div style={{ fontSize: 14, color: "var(--color-text-secondary)", fontStyle: "italic", padding: "6px 0" }}>
              Reading your day…
            </div>
          )}
          {!generating && aiError && aiLoadingDay === null && (
            <div role="alert" aria-live="polite" style={{
              fontSize: 13, color: "var(--color-text-danger)",
              padding: "6px 10px", background: "var(--color-background-danger)",
              borderRadius: "var(--border-radius-md)",
            }}>
              {aiError}
            </div>
          )}
          {!generating && (report?.data || report?.text) && <MirrorContent report={report} />}
        </div>
      )}

      {/* Past reflections — list of days that have an aiReport, excluding today */}
      {(() => {
        const past = Object.entries(muhasaba)
          .filter(([d, e]) => d !== day && (e?.aiReport?.data || e?.aiReport?.text))
          .sort(([a], [b]) => b.localeCompare(a)); // newest first
        if (past.length === 0) return null;
        const initialShow = 5;
        const visible = historyOpen ? past : past.slice(0, initialShow);
        return (
          <div style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                🪞 Past reflections
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{past.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visible.map(([d, e]) => {
                const previewSrc = reportPreviewText(e.aiReport) || "";
                const preview = previewSrc.length > 110
                  ? previewSrc.slice(0, 110).replace(/\s\S*$/, "") + "…"
                  : previewSrc;
                return (
                  <div
                    key={d}
                    onClick={() => setHistoryOpenDay(d)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setHistoryOpenDay(d); } }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--border-radius-md)",
                      background: "var(--color-background-secondary)",
                      cursor: "pointer",
                      border: "0.5px solid transparent",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = goldA(33); }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = "transparent"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>{fmt(d)}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                        {e.aiReport.model || ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontStyle: "italic", lineHeight: 1.5 }}>
                      "{preview}"
                    </div>
                  </div>
                );
              })}
            </div>
            {past.length > initialShow && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button onClick={() => setHistoryOpen((s) => !s)}
                  style={{ fontSize: 12, color: "var(--gold)", background: "transparent", border: "none", cursor: "pointer" }}>
                  {historyOpen ? "Show fewer" : `Show all ${past.length}`}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <Modal
        open={!!historyOpenDay}
        onClose={() => setHistoryOpenDay(null)}
        title={historyOpenDay ? `Reflection · ${fmt(historyOpenDay)}` : ""}>
        {historyOpenDay && muhasaba[historyOpenDay]?.aiReport && (() => {
          const r = muhasaba[historyOpenDay].aiReport;
          return (
            <div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
                Generated {new Date(r.generatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                {r.model ? ` · ${r.model}` : ""}
              </div>
              <MirrorContent report={r} />
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <button onClick={() => { setMuhasabaDay(historyOpenDay); setHistoryOpenDay(null); }}
                  style={{ fontSize: 13, padding: "5px 14px" }}>
                  Open this day's muhasaba
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center", marginBottom: 24 }}>
        {entry.updatedAt
          ? `Saved ${new Date(entry.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Auto-saves as you type."}
      </div>
    </div>
  );
}
