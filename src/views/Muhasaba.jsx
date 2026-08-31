import { useState, useRef, useLayoutEffect } from "react";
import {
  PRAYERS,
  VOLUNTARY_PRAYERS,
} from "../lib/constants";
import { Icon } from "../components/icons";
import { fmt, todayStr, addDays, addDaysToStr } from "../lib/dates";
import { fmtMins } from "../lib/focus";
import {
  emptyMuhasabaEntry,
  isMuhasabaFilled,
  muhasabaStreak,
  canGenerateMirror,
} from "../lib/muhasaba";
import { goldA, S } from "../lib/styles";
import Modal from "../components/Modal";
import MirrorContent, { reportPreviewText } from "../components/muhasaba/MirrorContent";
import DuaVerdict from "../components/muhasaba/DuaVerdict";
import GoalChecks from "../components/muhasaba/GoalChecks";
import FaraidSection from "../components/muhasaba/FaraidSection";
import ManhiyatSection from "../components/muhasaba/ManhiyatSection";
import GhaflahSection from "../components/muhasaba/GhaflahSection";
import NiyyahSection from "../components/muhasaba/NiyyahSection";
import ShukrSection from "../components/muhasaba/ShukrSection";

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
  // The candid AI reflection opens in a focused modal rather than sitting as
  // another card at the bottom of an already-long page.
  const [mirrorOpen, setMirrorOpen] = useState(false);
  // Day strip renders as many recent days as fit its width (no horizontal
  // scroll) + a "Pick" cell for older dates; stripDayCount is measured below.
  const stripRef = useRef(null);
  const [stripDayCount, setStripDayCount] = useState(14);
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

  // Day strip — the most-recent N days ending today (today is always the
  // rightmost cell, so it needs no scroll-into-view). N is measured from the
  // container width (below) so the row fills without horizontal scroll.
  const stripDays = [];
  for (let i = stripDayCount - 1; i >= 0; i--) stripDays.push(addDays(-i));

  // Render labels by anchoring the calendar date at NOON UTC and formatting
  // in UTC (the codebase's weekdayOf convention). A midnight-UTC anchor
  // formatted in the device timezone renders the *previous* calendar day for
  // any viewer west of UTC — an off-by-one on the date label. Noon-UTC + UTC
  // formatting keeps the weekday/numerals identical to the YYYY-MM-DD key for
  // every viewer.
  const dInfo = new Date(`${day}T12:00:00Z`);
  const dayLabel = dInfo.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "UTC",
  });
  // Pure string math — tz-independent, no Date round-trip to drift.
  const yesterdayDuaKey = addDaysToStr(day, -1);
  const yesterdayDua = muhasaba[yesterdayDuaKey]?.duaTomorrow;

  const filled = isMuhasabaFilled(entry);
  const canGenerate = canGenerateMirror(entry, day, prayerLog, focusLog);
  const report = entry.aiReport;
  const generating = aiLoadingDay === day;
  const reportPreview = report ? reportPreviewText(report) : null;

  // How many of the five pillars the user has touched tonight — drives the
  // context band's "reckoning" meter. Prayers/focus are auto context, so
  // pillar 1 counts only the user-entered Quran/dhikr/make-up.
  const pillarsTouched = [
    !!(entry.quranPages || entry.dhikr || entry.makeupNote),
    !!(entry.repentText || (entry.sinTags || []).length || Object.keys(entry.relations || {}).length),
    !!entry.ghaflahNote,
    !!(entry.niyyahRating > 0 || entry.bestDeed),
    (entry.shukr || []).some((s) => s && s.trim()),
  ].filter(Boolean).length;

  // Measure the strip and render as many day cells as fit one row (no
  // horizontal scroll). Reserve one slot for the "Pick" cell. Re-measures on
  // resize via ResizeObserver (window-resize fallback for older engines).
  // Layout effect so the count is set before paint — no one-frame flash of
  // clipped cells on a narrow (mobile) first render.
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const CELL = 52, GAP = 6;
    const measure = () => {
      const w = el.clientWidth;
      if (!w) return;
      const fit = Math.floor((w + GAP) / (CELL + GAP));
      setStripDayCount(Math.max(5, Math.min(31, fit - 1)));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const openMirror = () => setMirrorOpen(true);
  const generateAndOpen = () => { generateReport(day, { force: true }); setMirrorOpen(true); };

  return (
    <div className="view-content">
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
          محاسبة النفس · Muhasaba
        </div>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)" }}>
          {isToday ? "Tonight's reckoning" : dayLabel}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3, fontStyle: "italic" }}>
          "Hold yourselves accountable before you are held accountable." — ʿUmar ibn al-Khattab
        </div>
      </div>

      {/* Context band — streak + the day's facts (replaces the old right-rail
          idea; a full-width band leaves no empty column). */}
      <div className="muhasaba-band">
        <div className="muhasaba-band-streak">
          <span className="n serif">{streak}</span>
          <span className="k">day streak</span>
        </div>
        <div className="muhasaba-band-sep" />
        <div className="muhasaba-band-stats">
          <div className="mb-stat"><span className="k">Prayers</span><span className="v" style={{ color: "#3faa7e" }}>{dayPrayersDone.length} / {PRAYERS.length}</span></div>
          <div className="mb-stat"><span className="k">Focus</span><span className="v" style={{ color: "#8378d0" }}>{fmtMins(dayFocusMins)}</span></div>
          <div className="mb-stat">
            <span className="k">Reckoning</span>
            <span className="v">{pillarsTouched} / 5</span>
            <div className="muhasaba-band-prog"><i style={{ width: `${(pillarsTouched / 5) * 100}%` }} /></div>
          </div>
        </div>
      </div>

      {/* Day picker strip — fills the width, no scroll; "Pick" jumps to any
          older date via the native date picker. */}
      <div className="muhasaba-strip" ref={stripRef}>
        {stripDays.map((d) => {
          const isFilled = isMuhasabaFilled(muhasaba[d]);
          const active = d === day;
          // Noon-UTC anchor + UTC formatting so the weekday label matches the
          // YYYY-MM-DD key for every viewer (a midnight-UTC anchor formatted
          // in a west-of-UTC timezone shows the previous day).
          const dt = new Date(`${d}T12:00:00Z`);
          const weekday = dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
          const dayNum = Number(d.split("-")[2]);
          return (
            <button key={d} onClick={() => setMuhasabaDay(d)}
              className={`muhasaba-day${active ? " on" : ""}`}
              aria-pressed={active}>
              <span className="w">{weekday}</span>
              <span className="n" style={{ fontWeight: active ? 600 : 500 }}>{dayNum}</span>
              <span className={`dot${isFilled ? " f" : ""}`} />
            </button>
          );
        })}
        {/* Pick — a near-invisible native date input fills the cell, so tapping
            anywhere on it opens the OS date picker (reaches any past day). */}
        <label className="muhasaba-day muhasaba-day--pick" title="Jump to a date">
          <span className="w">Pick</span>
          <span className="n" aria-hidden>▾</span>
          <span className="dot" />
          <input type="date" max={todayStr()} value=""
            onChange={(e) => { if (e.target.value) setMuhasabaDay(e.target.value); }}
            aria-label="Jump to a date"
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", padding: 0, border: "none" }} />
        </label>
      </div>

      {/* Yesterday's du'a → today's verdict. The user wrote a commitment
          last night; tonight they answer honestly: honoured, partial, or
          missed. This is the loop that turns daily reflection into actual
          behavioural feedback. */}
      {yesterdayDua && (
        <DuaVerdict
          key={`dua-${day}`}
          yesterdayDua={yesterdayDua}
          duaCheck={entry.duaCheck}
          updateEntry={updateEntry}
        />
      )}

      {/* Goals → Muhasaba — nightly self-check per active goal. Closes the
          loop between the user's stated commitments (Goals tab) and tonight's
          honest verdict. Three values per goal: yes / partial / no. Unset =
          user hasn't answered for that goal yet. */}
      <GoalChecks
        key={`goals-${day}`}
        goals={goals}
        goalChecks={entry.goalChecks}
        setGoalCheck={setGoalCheck}
      />

      {/* 1. Fara'id */}
      <FaraidSection
        entry={entry}
        updateEntry={updateEntry}
        dayPrayersDone={dayPrayersDone}
        dayVoluntaryDone={dayVoluntaryDone}
      />

      {/* 2. Manhiyat */}
      <ManhiyatSection
        entry={entry}
        updateEntry={updateEntry}
        toggleSinTag={toggleSinTag}
        toggleRelation={toggleRelation}
        updateRelationNote={updateRelationNote}
      />

      {/* 3. Ghaflah */}
      <GhaflahSection entry={entry} updateEntry={updateEntry} dayFocusMins={dayFocusMins} />

      {/* 4. Niyyah */}
      <NiyyahSection entry={entry} updateEntry={updateEntry} />

      {/* 5. Shukr */}
      <ShukrSection entry={entry} updateShukr={updateShukr} />

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

      {/* The mirror — a slim trigger; the full reflection opens in a focused
          modal (below) so it doesn't add another long card to the page. */}
      {!canGenerate && !report && !generating ? (
        <div style={{
          ...S.card, marginBottom: 14, textAlign: "center",
          padding: "18px 16px", borderStyle: "dashed",
          borderColor: "var(--color-border-tertiary)",
        }}>
          <div style={{ marginBottom: 6, color: "var(--gold)", display: "flex", justifyContent: "center" }}><Icon name="mirror" size={24} /></div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 500, marginBottom: 3 }}>
            The mirror needs something to read
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Log a prayer, run a focus session, or fill any section above — then a candid mentor's note unlocks.
          </div>
        </div>
      ) : (
        <div className="muhasaba-mirror">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="mirror" size={14} /> The mirror · candid reflection
            </div>
            <div className="teaser">
              {generating ? "Reading your day…"
                : reportPreview ? `"${reportPreview}"`
                : "A candid mentor's note on your day."}
            </div>
            {!generating && aiError && aiLoadingDay === null && (
              <div role="alert" aria-live="polite" style={{ fontSize: 12, color: "var(--color-text-danger)", marginTop: 6 }}>
                {aiError}
              </div>
            )}
          </div>
          <button
            onClick={report && !generating ? openMirror : generateAndOpen}
            disabled={generating || (!report && !canGenerate)}
            className="btn-primary"
            style={{ fontSize: 13, padding: "8px 15px", flexShrink: 0 }}>
            {generating ? "Generating…" : report ? "Read reflection →" : "Generate reflection"}
          </button>
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
              <div style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 7 }}>
                <Icon name="mirror" size={14} /> Past reflections
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{past.length}</div>
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
                      <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{fmt(d)}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {e.aiReport.model || ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.5 }}>
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
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
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

      {/* The mirror — focused reading of the current day's reflection. Handles
          the generating / error / result states, plus Regenerate (and a first
          Generate if opened before a report exists). */}
      <Modal
        open={mirrorOpen}
        onClose={() => setMirrorOpen(false)}
        title={`The mirror · ${fmt(day)}`}>
        {generating ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)", fontStyle: "italic", padding: "8px 0", textAlign: "center" }}>
            Reading your day…
          </div>
        ) : aiError && aiLoadingDay === null ? (
          <div role="alert" aria-live="polite" style={{
            fontSize: 13, color: "var(--color-text-danger)",
            padding: "8px 12px", background: "var(--color-background-danger)",
            borderRadius: "var(--border-radius-md)",
          }}>
            {aiError}
          </div>
        ) : (report?.data || report?.text) ? (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Generated {new Date(report.generatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
              {report.model ? ` · ${report.model}` : ""}
            </div>
            <MirrorContent report={report} />
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button onClick={() => generateReport(day, { force: true })}
                disabled={generating || !canGenerate}
                style={{ fontSize: 13, padding: "5px 14px" }}>
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 12 }}>
              {filled ? "Hold yourself to your own niyyah, not your own comfort." : "Reflection will be sharper if you fill the sections above first."}
            </div>
            <button onClick={() => generateReport(day, { force: true })}
              disabled={generating || !canGenerate}
              className="btn-primary"
              style={{ fontSize: 13, padding: "7px 16px" }}>
              Generate reflection
            </button>
          </div>
        )}
      </Modal>

      <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginBottom: 24 }}>
        {entry.updatedAt
          ? `Saved ${new Date(entry.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Auto-saves as you type."}
      </div>
    </div>
  );
}
