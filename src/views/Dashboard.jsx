import { useState } from "react";
import {
  FALLBACK_VERSE,
  INTENTIONS,
} from "../lib/constants";
import { todayStr } from "../lib/dates";
import { isGoalDone, pct } from "../lib/goals";
import { goldA, S } from "../lib/styles";
import GoalCard from "../components/GoalCard";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { MorningPanel, EveningPanel } from "../components/DailyPanels";

// Dashboard / daily-loop view. Reads aggregate state from Planner; does not
// own any. Morning + Evening panels at the top scaffold the day; the rest
// is supporting context (stats, upcoming goals, AI preview, verse).
export default function Dashboard({
  goals,
  muhasaba,
  totalFocusMins,
  totalSessions,
  overallPct,
  prayerTimes,
  intentionIdx,
  verseOfDay,
  refreshVerse,
  lastActivityByGoal,
  setView,
  setMuhasabaDay,
  onSelectGoal,
  savedVerses,
  saveVerse,
  removeSavedVerse,
  isVerseSaved,
  // Daily-loop props — see Planner.jsx for derivations.
  dayPhase,
  yDua,
  yMirrorTomorrow,
  todayDua,
  nextPrayer,
  prayerCity,
  firstTask,
  qazaOwedTotal,
  prayersTodaySummary,
  focusTodaySummary,
  muhasabaStateValue,
  startTaskTimer,
}) {
  // Saved-verses modal + transient "copied" pill state.
  const [versesOpen, setVersesOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // Clipboard write with a 1.6s "Copied!" indicator that auto-fades.
  // Falls back silently if the browser blocks the write (older Safari,
  // insecure context). Visible verseKey drives which copy button shows
  // feedback so the modal-list copies are distinguishable from the
  // main verse copy.
  function copyVerse(v) {
    if (!v) return;
    const text = [
      v.arabic,
      v.translation,
      v.url || `https://quran.com/${v.verseKey}`,
    ].filter(Boolean).join("\n\n");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopiedKey(v.verseKey);
          setTimeout(() => setCopiedKey((k) => (k === v.verseKey ? null : k)), 1600);
        },
        () => { /* clipboard blocked — silent */ }
      );
    }
  }

  // First-run onboarding — visible until all three core features are set up.
  const onboardingDone = {
    prayer: !!prayerTimes,
    goal: goals.length > 0,
    muhasaba: Object.keys(muhasaba || {}).length > 0,
  };
  const showOnboarding = !(onboardingDone.prayer && onboardingDone.goal && onboardingDone.muhasaba);
  const today = todayStr();
  const aiReport = muhasaba[today]?.aiReport;
  const aiPreviewSrc = aiReport?.data?.summary || aiReport?.text || null;
  const aiPreview = aiPreviewSrc
    ? aiPreviewSrc.length > 160
      ? aiPreviewSrc.slice(0, 160).replace(/\s\S*$/, "") + "…"
      : aiPreviewSrc
    : null;

  const statTiles = [
    { label: "Goals", value: goals.length, color: "#7F77DD" },
    { label: "Short-term", value: goals.filter((g) => g.type === "short").length, color: "#378ADD" },
    { label: "Completed", value: goals.filter((g) => pct(g) === 100).length, color: "#1D9E75" },
    { label: "Focus mins", value: totalFocusMins, color: "var(--gold)" },
    { label: "Sessions", value: totalSessions, color: "#D88E4A" },
  ];

  const upcomingGoals = [...goals]
    .filter((g) => !isGoalDone(g))
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 4);

  return (
    <div className="view-content">
      {/* Daily loop — Morning + Evening panels. Time-of-day emphasises one;
          both stay visible so the user sees the rhythm at a glance. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
        gap: 14,
        marginBottom: 18,
      }}>
        <MorningPanel
          phase={dayPhase}
          prayerTimesSet={!!prayerTimes}
          yDua={yDua}
          yMirrorTomorrow={yMirrorTomorrow}
          nextPrayer={nextPrayer}
          prayerCity={prayerCity}
          firstTask={firstTask}
          qazaOwedTotal={qazaOwedTotal}
          onOpenYesterday={() => { setMuhasabaDay(yDua?.day || todayStr()); setView("muhasaba"); }}
          onOpenMirrorDay={(day) => { setMuhasabaDay(day); setView("muhasaba"); }}
          onOpenPrayer={() => setView("prayer")}
          onOpenAddPrayer={() => setView("prayer")}
          onStartFirstTask={(gId, tId) => startTaskTimer(gId, tId)}
          onOpenGoals={() => setView("add")}
        />
        <EveningPanel
          phase={dayPhase}
          prayersTodaySummary={prayersTodaySummary}
          focusTodaySummary={focusTodaySummary}
          muhasabaStateValue={muhasabaStateValue}
          todayDua={todayDua}
          onOpenPrayer={() => setView("prayer")}
          onOpenFocus={() => setView("pomodoro")}
          onOpenMuhasaba={() => { setMuhasabaDay(todayStr()); setView("muhasaba"); }}
        />
      </div>

      {/* First-run onboarding — auto-dismisses when all three steps are done */}
      {showOnboarding && (() => {
        const steps = [
          { key: "prayer", icon: "🕌", label: "Set your prayer times", hint: "Lets the dashboard surface the next prayer.", done: onboardingDone.prayer, go: () => setView("prayer") },
          { key: "goal", icon: "🌱", label: "Plant your first goal", hint: "Start with a Deen goal you can return to daily.", done: onboardingDone.goal, go: () => setView("add") },
          { key: "muhasaba", icon: "🌙", label: "Try tonight's muhasaba", hint: "Hold yourself accountable — even one entry is a start.", done: onboardingDone.muhasaba, go: () => { setMuhasabaDay(todayStr()); setView("muhasaba"); } },
        ];
        const completed = steps.filter((s) => s.done).length;
        return (
          <div style={{ ...S.card, marginBottom: 18, borderColor: goldA(36) }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 3 }}>
                  Get started
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  Three small steps to set the rhythm
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                {completed}/{steps.length}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((s) => (
                <div
                  key={s.key}
                  onClick={s.done ? undefined : s.go}
                  role={s.done ? undefined : "button"}
                  tabIndex={s.done ? -1 : 0}
                  onKeyDown={(e) => { if (!s.done && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); s.go(); } }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--border-radius-md)",
                    background: s.done ? "rgba(127,190,143,0.08)" : "var(--color-background-secondary)",
                    border: `0.5px solid ${s.done ? "rgba(127,190,143,0.32)" : "var(--color-border-tertiary)"}`,
                    cursor: s.done ? "default" : "pointer",
                    opacity: s.done ? 0.7 : 1,
                  }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: s.done ? "rgba(127,190,143,0.22)" : "var(--color-background-primary)",
                    color: s.done ? "var(--color-text-success)" : "var(--color-text-secondary)",
                    fontSize: 14, fontWeight: 600, flexShrink: 0,
                  }}>
                    {s.done ? "✓" : s.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 500,
                      color: s.done ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                      textDecoration: s.done ? "line-through" : "none",
                    }}>
                      {s.label}
                    </div>
                    {!s.done && (
                      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 1 }}>{s.hint}</div>
                    )}
                  </div>
                  {!s.done && (
                    <span style={{ fontSize: 13, color: "var(--gold)", flexShrink: 0 }}>Open ›</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        {statTiles.map((t) => {
          // Each tile gets a faint background wash + edge tint matching its
          // accent. The gold tile goes through goldA() so the tint follows
          // the active theme; category-coloured tiles use direct hex+alpha
          // because those colours don't change between dark and light.
          const isVar = t.color.startsWith("var(");
          const tint = isVar ? goldA(12) : t.color + "1f";
          const border = isVar ? goldA(28) : t.color + "44";
          return (
            <div key={t.label} className="tile-hover"
              style={{
                background: tint,
                borderRadius: "var(--border-radius-md)",
                padding: "14px 16px",
                border: `0.5px solid ${border}`,
              }}>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 5 }}>{t.label}</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: t.color }}>{t.value}</div>
            </div>
          );
        })}
      </div>

      {/* overall progress */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 7 }}>
          <span style={{ fontWeight: 500 }}>Overall progress</span>
          <span style={{ color: "var(--gold)", fontWeight: 500 }}>{overallPct}%</span>
        </div>
        <div style={{ height: 10, background: "var(--color-background-secondary)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${overallPct}%`, background: "var(--gold)", borderRadius: 99, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 6, textAlign: "center" }}>
          Every effort counts towards your Aakhirah
        </div>
      </div>

      {/* random intention nudge */}
      <div style={{
        textAlign: "center", fontSize: 14, color: "var(--color-text-tertiary)",
        fontStyle: "italic", marginBottom: 16, padding: "0 16px",
      }}>
        {INTENTIONS[intentionIdx]}
      </div>

      {/* upcoming goals */}
      <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 10 }}>Upcoming goals</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {upcomingGoals.map((g) => (
          <GoalCard key={g.id} g={g} lastActivityDay={lastActivityByGoal[g.id]} onSelect={() => onSelectGoal(g.id)} />
        ))}
        {goals.length === 0 && (
          <EmptyState icon="🌱"
            title="Plant your first niyyah"
            hint="Start with a Deen goal — memorising a surah, daily Quran, regular dhikr. Small, consistent steps build the strongest habits." />
        )}
      </div>

      {/* AI reflection teaser */}
      {aiPreview && (
        <div onClick={() => { setMuhasabaDay(today); setView("muhasaba"); }}
          role="button"
          tabIndex={0}
          aria-label="Open today's reflection in Muhasaba"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMuhasabaDay(today); setView("muhasaba"); } }}
          className="tap-card"
          style={{
            ...S.card, marginBottom: 18, cursor: "pointer",
            borderColor: "var(--color-border-secondary)",
            transition: "transform 0.12s, border-color 0.15s, box-shadow 0.18s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.borderColor = "var(--gold)";
            e.currentTarget.style.boxShadow = "var(--shadow-card)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.borderColor = "var(--color-border-secondary)";
            e.currentTarget.style.boxShadow = "none";
          }}>
          <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>
            🪞 The mirror · today's reflection
          </div>
          <div style={{ fontSize: 14, color: "var(--color-text-secondary)", fontStyle: "italic", lineHeight: 1.55 }}>
            "{aiPreview}"
          </div>
          <div style={{ fontSize: 12, color: "var(--gold)", marginTop: 8 }}>
            Read the full note in Muhasaba ›
          </div>
        </div>
      )}

      {/* verse — closing spiritual moment */}
      {verseOfDay && (() => {
        const saved = isVerseSaved ? isVerseSaved(verseOfDay.verseKey) : false;
        const savedCount = savedVerses?.length || 0;
        const copyAction = (
          <button
            onClick={() => copyVerse(verseOfDay)}
            aria-label="Copy verse to clipboard"
            title="Copy verse"
            style={{
              fontSize: 12, padding: "2px 10px", lineHeight: 1.4,
              background: "transparent",
              border: `0.5px solid ${goldA(35)}`,
              borderRadius: 99,
              color: "var(--gold)",
              cursor: "pointer",
              opacity: 0.85,
              whiteSpace: "nowrap",
            }}>
            {copiedKey === verseOfDay.verseKey ? "✓ Copied" : "⧉ Copy"}
          </button>
        );
        const saveAction = saveVerse && (
          <button
            onClick={() => saveVerse(verseOfDay)}
            disabled={saved}
            aria-label={saved ? "Already saved" : "Save this verse"}
            title={saved ? "Already saved" : "Save this verse"}
            style={{
              fontSize: 12, padding: "2px 10px", lineHeight: 1.4,
              background: saved ? goldA(18) : "transparent",
              border: `0.5px solid ${goldA(35)}`,
              borderRadius: 99,
              color: "var(--gold)",
              cursor: saved ? "default" : "pointer",
              opacity: saved ? 0.6 : 0.85,
              whiteSpace: "nowrap",
            }}>
            {saved ? "★ Saved" : "☆ Save"}
          </button>
        );
        return (
          <div style={{
            marginTop: 8, marginBottom: 8, padding: "18px 4px",
            borderTop: `0.5px dashed ${goldA(20)}`,
            textAlign: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.8 }}>
                Verse of the day
              </div>
              {refreshVerse && (
                <button
                  onClick={refreshVerse}
                  aria-label="Show another verse"
                  title="Show another verse"
                  style={{
                    fontSize: 12, padding: "2px 8px", lineHeight: 1.4,
                    background: "transparent",
                    border: `0.5px solid ${goldA(35)}`,
                    borderRadius: 99,
                    color: "var(--gold)",
                    cursor: "pointer",
                    opacity: 0.8,
                  }}>
                  ↻
                </button>
              )}
            </div>
            <div className="arabic" style={{ fontSize: 22, color: "var(--gold)", marginBottom: 10, opacity: 0.92 }}>
              {verseOfDay.arabic || FALLBACK_VERSE.arabic}
            </div>
            <div style={{
              fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6,
              fontStyle: "italic", maxWidth: 540, margin: "0 auto",
            }}>
              "{(verseOfDay.translation || FALLBACK_VERSE.translation).replace(/<[^>]*>/g, "")}"
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <a href={verseOfDay.url} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: "var(--gold)", textDecoration: "none", opacity: 0.7 }}>
                Quran.com {verseOfDay.verseKey} ↗
              </a>
              {saveAction}
              {copyAction}
              {savedCount > 0 && (
                <button
                  onClick={() => setVersesOpen(true)}
                  aria-label={`Open saved verses (${savedCount})`}
                  style={{
                    fontSize: 12, padding: "2px 10px", lineHeight: 1.4,
                    background: "transparent",
                    border: `0.5px solid ${goldA(25)}`,
                    borderRadius: 99,
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                    opacity: 0.75,
                    whiteSpace: "nowrap",
                  }}>
                  📿 {savedCount} saved
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Saved verses modal — personal collection, newest first. Each row
          gets its own copy button + a remove control. */}
      {savedVerses && (
        <Modal
          open={versesOpen}
          onClose={() => setVersesOpen(false)}
          title={`Saved verses · ${savedVerses.length}`}
          maxWidth={620}
        >
          {savedVerses.length === 0 ? (
            <EmptyState
              icon="📿"
              title="No saved verses yet"
              hint="Tap ☆ Save on the verse of the day to start your collection."
              padY={20}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {savedVerses.map((v) => (
                <div key={v.id} style={{
                  padding: "14px 14px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  border: "0.5px solid var(--color-border-tertiary)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                    <a href={v.url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: "var(--gold)", fontWeight: 600, textDecoration: "none", letterSpacing: "0.4px", textTransform: "uppercase" }}>
                      Quran.com {v.verseKey} ↗
                    </a>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      saved {new Date(v.savedAt).toLocaleDateString([], { dateStyle: "short" })}
                    </span>
                  </div>
                  {v.arabic && (
                    <div className="arabic" style={{ fontSize: 19, color: "var(--gold)", marginBottom: 8, opacity: 0.92 }}>
                      {v.arabic}
                    </div>
                  )}
                  {v.translation && (
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.55, fontStyle: "italic", marginBottom: 10 }}>
                      "{v.translation}"
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      onClick={() => copyVerse(v)}
                      aria-label="Copy this verse"
                      style={{ fontSize: 12, padding: "4px 10px" }}>
                      {copiedKey === v.verseKey ? "✓ Copied" : "⧉ Copy"}
                    </button>
                    {removeSavedVerse && (
                      <button
                        onClick={() => {
                          if (window.confirm("Remove this saved verse?")) removeSavedVerse(v.id);
                        }}
                        aria-label="Remove this saved verse"
                        style={{
                          fontSize: 12, padding: "4px 10px",
                          color: "var(--color-text-tertiary)",
                          border: "0.5px solid var(--color-border-tertiary)",
                        }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
