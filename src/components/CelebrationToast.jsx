// Fixed-position top toast used by Planner for transient celebrations.
// One slot — latest wins (new celebration replaces the previous).
//
//   { kind: "goal", goal }            — a goal flipped to completed today
//   { kind: "focusStreak", count }    — N consecutive days meeting the focus goal
//   { kind: "muhasabaStreak", count } — N consecutive nights of muhasaba
//   { kind: "istiqamahStreak", count }— N consecutive days of showing up
//
// Streak kinds get a "number-hero" layout: the count is a large gold numeral,
// a crafted glyph sits in a badge whose glow intensifies with the milestone
// (tier 1→4 across 7 / 30 / 100 / 365), and a "→ next N" nudge points at the
// next milestone. Goal-complete keeps a title-first layout.
//
// `onDismiss` clears the celebration; `onOpen` (optional) routes to the view.

import { CAT_COLORS } from "../lib/constants";
import { STREAK_MILESTONES } from "../lib/focus";

// Crafted glyphs (no emoji — consistent across platforms, on-tone with the
// gold/dark aesthetic). Filled closed paths, tinted via currentColor.
function Glyph({ name }) {
  const paths = {
    flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
    moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
    sparkle: "M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z",
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={paths[name] || paths.sparkle} />
    </svg>
  );
}

// Smallest milestone strictly greater than `count` (null once maxed out).
const nextMilestone = (count) => STREAK_MILESTONES.find((m) => m > count) ?? null;
// Glow tier by milestone reached.
const glowTier = (count) => (count >= 365 ? 4 : count >= 100 ? 3 : count >= 30 ? 2 : 1);

function variantFor(celebration) {
  if (celebration.kind === "goal") {
    const g = celebration.goal;
    return {
      streak: false,
      accent: CAT_COLORS[g.category] || "var(--gold)",
      glyph: "sparkle",
      eyebrow: "Alhamdulillah · goal complete",
      title: g.title,
      sub: "May Allah accept it. One niyyah closer.",
      actionLabel: "Open ›",
    };
  }
  const streakBase = { streak: true, count: celebration.count };
  if (celebration.kind === "focusStreak") {
    return { ...streakBase, accent: "var(--gold)", glyph: "flame", unit: "days",
      eyebrow: "Focus streak", sub: "Consistency over intensity.", actionLabel: "Open Focus ›" };
  }
  if (celebration.kind === "muhasabaStreak") {
    return { ...streakBase, accent: "#7BB6C7", glyph: "moon", unit: "nights",
      eyebrow: "Muhasaba streak", sub: "Accounting for yourself before you're brought to account.", actionLabel: "Open Muhasaba ›" };
  }
  if (celebration.kind === "istiqamahStreak") {
    return { ...streakBase, accent: "var(--noor)", glyph: "flame", unit: "days",
      eyebrow: "Istiqāmah", sub: "The most beloved deeds to Allah are the constant ones.", actionLabel: "Open ›" };
  }
  return null;
}

export default function CelebrationToast({ celebration, onDismiss, onOpen }) {
  if (!celebration) return null;
  const v = variantFor(celebration);
  if (!v) return null;

  const accent = v.accent;
  const isVarAccent = accent.startsWith("var(");
  // Hex accents concat alpha; CSS-var accents tint via color-mix. Both wash.
  const tint = (pct) => isVarAccent
    ? `color-mix(in srgb, ${accent} ${pct}%, transparent)`
    : accent + Math.round(pct * 255 / 100).toString(16).padStart(2, "0");

  const tier = v.streak ? glowTier(v.count) : 1;
  const next = v.streak ? nextMilestone(v.count) : null;
  const numberSize = tier >= 3 ? 46 : 40;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pop-in"
      style={{
        position: "fixed",
        top: "calc(14px + env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        width: "calc(100% - 24px)",
        maxWidth: 520,
        padding: "14px 18px 14px 22px",
        borderRadius: "var(--border-radius-lg)",
        background: `linear-gradient(135deg, ${tint(13)} 0%, ${tint(4)} 100%), var(--bg-card)`,
        border: `0.5px solid ${tint(53)}`,
        boxShadow: "var(--shadow-modal)",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute", top: 8, right: 10,
          fontSize: 13, padding: "2px 7px",
          background: "transparent",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 99,
          color: "var(--text-muted)",
          cursor: "pointer", lineHeight: 1,
        }}
      >
        ✕
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Glyph badge — glow ring intensity scales with the milestone tier. */}
        <span
          className="streak-glow"
          style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: accent,
            background: tint(18),
            border: `0.5px solid ${tint(36)}`,
            // Base ring + a pulsing halo (see .streak-glow keyframes); the var
            // brightens with tier so bigger milestones glow harder.
            ["--glow"]: tint(16 + tier * 12),
          }}
        >
          <Glyph name={v.glyph} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: accent,
            letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: v.streak ? 1 : 3,
          }}>
            {v.eyebrow}
          </div>

          {v.streak ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: numberSize, fontWeight: 800, color: accent, lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {v.count}
                </span>
                <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>{v.unit}</span>
                {next && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>
                    → next {next}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 5, lineHeight: 1.4 }}>
                {v.sub}
              </div>
            </>
          ) : (
            <>
              <div style={{
                fontSize: 16, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {v.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.4 }}>
                {v.sub}
              </div>
            </>
          )}
        </div>

        {onOpen && (
          <button
            onClick={onOpen}
            style={{
              fontSize: 13, fontWeight: 500,
              padding: "6px 12px", borderRadius: 99,
              background: "transparent",
              border: `0.5px solid ${tint(53)}`,
              color: accent,
              cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
              alignSelf: "center",
            }}
          >
            {v.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
