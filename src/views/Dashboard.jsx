import { useState } from "react";
import {
  FALLBACK_VERSE,
  INTENTIONS,
} from "../lib/constants";
import { todayStr } from "../lib/dates";
import { isGoalDone } from "../lib/goals";
import { goldA, S } from "../lib/styles";
import GoalCard from "../components/GoalCard";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import NowCard from "../components/NowCard";
import ContinuityStrip from "../components/ContinuityStrip";

// Dashboard / daily-loop view. Reads aggregate state from Planner; does not
// own any. The NowCard hero leads, then the continuity thread; the rest is
// supporting context (upcoming goals, AI preview, verse).
export default function Dashboard({
  goals,
  muhasaba,
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
  streak,
  todayActive,
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

  const upcomingGoals = [...goals]
    .filter((g) => !isGoalDone(g))
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 4);

  return (
    <div className="view-content">
      {/* Hero — the single time-aware focal point: what to do right now,
          glanceable prayer/focus progress, one primary action, and the
          istiqāmah streak. The detailed Morning/Evening rhythm follows below. */}
      <NowCard
        dayPhase={dayPhase}
        prayerTimesSet={!!prayerTimes}
        nextPrayer={nextPrayer}
        prayerCity={prayerCity}
        prayersTodaySummary={prayersTodaySummary}
        focusTodaySummary={focusTodaySummary}
        firstTask={firstTask}
        muhasabaStateValue={muhasabaStateValue}
        streak={streak}
        todayActive={todayActive}
        onOpenPrayer={() => setView("prayer")}
        onOpenAddPrayer={() => setView("prayer")}
        onStartTask={(gId, tId) => startTaskTimer(gId, tId)}
        onOpenFocus={() => setView("pomodoro")}
        onOpenMuhasaba={() => { setMuhasabaDay(todayStr()); setView("muhasaba"); }}
        onOpenGoals={() => setView("add")}
      />

      {/* Continuity thread — only the day-to-day spiritual beats the hero
          doesn't already show. Renders nothing when there's nothing to carry. */}
      <ContinuityStrip
        yDua={yDua}
        yMirrorTomorrow={yMirrorTomorrow}
        qazaOwedTotal={qazaOwedTotal}
        todayDua={todayDua}
        onOpenYesterday={() => { setMuhasabaDay(yDua?.day || todayStr()); setView("muhasaba"); }}
        onOpenMirrorDay={(day) => { setMuhasabaDay(day); setView("muhasaba"); }}
        onOpenPrayer={() => setView("prayer")}
        onOpenMuhasaba={() => { setMuhasabaDay(todayStr()); setView("muhasaba"); }}
      />

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

      {/* upcoming goals — overall % folded into the header instead of its
          own card; the row of vanity stat tiles now lives in the Stats tab. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>Upcoming goals</span>
        {goals.length > 0 && (
          <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>{overallPct}% overall</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {upcomingGoals.map((g) => (
          <GoalCard key={g.id} g={g} lastActivityDay={lastActivityByGoal[g.id]} onSelect={() => onSelectGoal(g.id)} />
        ))}
        {goals.length === 0 && (
          <EmptyState icon="🌱"
            title="Plant your first niyyah"
            hint="Start with a Deen goal — memorising a surah, daily Quran, regular dhikr. Small, consistent steps build the strongest habits." />
        )}
        {goals.length > 0 && upcomingGoals.length === 0 && (
          <EmptyState icon="✓"
            title="All goals complete — alhamdulillah"
            hint="Nothing pending. Plant a new niyyah, or rest in what you've finished."
            padY={20} />
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
            {/* niyyah lead-out — the rotating intention, folded into the
                verse's closing moment rather than floating mid-page. */}
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontStyle: "italic", marginTop: 16, opacity: 0.85, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              {INTENTIONS[intentionIdx]}
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
