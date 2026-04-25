import {
  FALLBACK_VERSE,
  INTENTIONS,
  PRAYER_ICONS,
  PRAYER_COLORS,
} from "../lib/constants";
import { todayStr } from "../lib/dates";
import { isGoalDone, pct } from "../lib/goals";
import { gold, S } from "../lib/styles";
import GoalCard from "../components/GoalCard";
import EmptyState from "../components/EmptyState";

// Dashboard / "Right now" view. Reads aggregate state from Planner; does not
// own any. The hero variant (which prompt to surface, with what colour and
// CTA) is computed in Planner so we can reuse the data without re-deriving
// here.
export default function Dashboard({
  goals,
  muhasaba,
  totalFocusMins,
  totalSessions,
  overallPct,
  hero,
  nextPrayer,
  prayerTimes,
  intentionIdx,
  verseOfDay,
  refreshVerse,
  lastActivityByGoal,
  setView,
  setMuhasabaDay,
  onSelectGoal,
}) {
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
      {/* HERO — Right now */}
      <div onClick={hero.onClick || undefined}
        role={hero.onClick ? "button" : undefined}
        tabIndex={hero.onClick ? 0 : undefined}
        aria-label={hero.onClick ? `${hero.eyebrow}: ${hero.title}` : undefined}
        onKeyDown={(e) => { if (hero.onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); hero.onClick(); } }}
        style={{
          position: "relative",
          padding: "22px 24px",
          borderRadius: "var(--border-radius-lg)",
          background: `linear-gradient(135deg, ${hero.accent}24 0%, ${hero.accent}0a 60%, transparent 100%), var(--color-background-primary)`,
          border: `0.5px solid ${hero.accent}55`,
          marginBottom: 18,
          cursor: hero.onClick ? "pointer" : "default",
          transition: "transform 0.12s ease, border-color 0.15s ease, box-shadow 0.18s ease",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          if (hero.onClick) {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = `0 12px 30px ${hero.accent}24`;
            e.currentTarget.style.borderColor = hero.accent + "99";
          }
        }}
        onMouseLeave={(e) => {
          if (hero.onClick) {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.borderColor = hero.accent + "55";
          }
        }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: hero.accent }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 14,
            background: `${hero.accent}22`,
            border: `0.5px solid ${hero.accent}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, flexShrink: 0,
          }}>
            {hero.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, color: hero.accent, fontWeight: 600,
              letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 3,
            }}>
              {hero.eyebrow}
            </div>
            <div style={{
              fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)",
              lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {hero.title}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 3 }}>
              {hero.subtitle}
            </div>
          </div>
          {hero.cta && (
            <span style={{
              fontSize: 13, fontWeight: 500,
              color: hero.accent,
              border: `0.5px solid ${hero.accent}88`,
              padding: "6px 12px", borderRadius: 99,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {hero.cta} ›
            </span>
          )}
        </div>
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
          <div style={{ ...S.card, marginBottom: 18, borderColor: "rgba(201,168,76,0.36)" }}>
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
          // accent. The CSS-var path (`var(--gold)`) doesn't support hex+alpha
          // concatenation, so for the gold tile we use rgba directly.
          const isVar = t.color.startsWith("var(");
          const tint = isVar ? "rgba(201,168,76,0.12)" : t.color + "1f";
          const border = isVar ? "rgba(201,168,76,0.28)" : t.color + "44";
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

      {/* next prayer snippet */}
      {nextPrayer && (() => {
        const pColor = PRAYER_COLORS[nextPrayer.name] || gold;
        return (
          <div style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            padding: "var(--card-padding)",
            paddingLeft: 22,
            borderRadius: "var(--border-radius-lg)",
            background: `linear-gradient(135deg, ${pColor}1f 0%, ${pColor}08 100%)`,
            border: `0.5px solid ${pColor}55`,
            overflow: "hidden",
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: pColor }} />
            <span style={{
              fontSize: 22, width: 40, height: 40, borderRadius: 12,
              background: pColor + "22",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {PRAYER_ICONS[nextPrayer.name]}
            </span>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Next prayer</div>
              <div style={{ fontWeight: 500, color: pColor }}>{nextPrayer.name} · {nextPrayer.time}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button onClick={() => setView("prayer")}
                style={{ fontSize: 14, borderColor: pColor + "55", color: pColor }}>
                View all ›
              </button>
            </div>
          </div>
        );
      })()}
      {!prayerTimes && (
        <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer" }}
          onClick={() => setView("prayer")}>
          <span style={{ fontSize: 21 }}>🕌</span>
          <span style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>Set up prayer times →</span>
        </div>
      )}

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
          style={{
            ...S.card, marginBottom: 18, cursor: "pointer",
            borderColor: "var(--color-border-secondary)",
            transition: "transform 0.12s, border-color 0.15s, box-shadow 0.18s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.borderColor = "var(--gold)";
            e.currentTarget.style.boxShadow = "0 8px 22px rgba(0,0,0,0.18)";
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
      {verseOfDay && (
        <div style={{
          marginTop: 8, marginBottom: 8, padding: "18px 4px",
          borderTop: `0.5px dashed ${gold}33`,
          textAlign: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
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
                  border: "0.5px solid rgba(201,168,76,0.35)",
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
          <a href={verseOfDay.url} target="_blank" rel="noreferrer"
            style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "var(--gold)", textDecoration: "none", opacity: 0.7 }}>
            Quran.com {verseOfDay.verseKey} ↗
          </a>
        </div>
      )}
    </div>
  );
}
