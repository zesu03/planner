// Fixed-position top toast used by Planner for transient celebrations.
// One slot — latest wins (new celebration replaces the previous). Three
// kinds today, each with its own accent + copy:
//
//   { kind: "goal", goal }            — a goal flipped to completed today
//   { kind: "focusStreak", count }    — N consecutive days of meeting the daily focus goal
//   { kind: "muhasabaStreak", count } — N consecutive days of muhasaba
//
// `onDismiss` clears the celebration state. `onOpen` is optional — fires
// when the user taps the action button (routes to the relevant view).

import { CAT_COLORS } from "../lib/constants";

function variantFor(celebration) {
  if (celebration.kind === "goal") {
    const g = celebration.goal;
    const accent = CAT_COLORS[g.category] || "var(--gold)";
    return {
      accent,
      icon: "✨",
      eyebrow: "Alhamdulillah · goal complete",
      title: g.title,
      sub: "May Allah accept it. One niyyah closer.",
      actionLabel: "Open ›",
    };
  }
  if (celebration.kind === "focusStreak") {
    return {
      accent: "var(--gold)",
      icon: "🔥",
      eyebrow: "Focus streak",
      title: `${celebration.count} days in a row`,
      sub: "Consistency is louder than any single session. Keep going.",
      actionLabel: "Open Focus ›",
    };
  }
  if (celebration.kind === "muhasabaStreak") {
    return {
      accent: "#7BB6C7",
      icon: "🌙",
      eyebrow: "Muhasaba streak",
      title: `${celebration.count} nights of self-accounting`,
      sub: "ʿUmar would be pleased. Don't break the chain tonight.",
      actionLabel: "Open Muhasaba ›",
    };
  }
  return null;
}

export default function CelebrationToast({ celebration, onDismiss, onOpen }) {
  if (!celebration) return null;
  const v = variantFor(celebration);
  if (!v) return null;
  const accent = v.accent;
  const isVarAccent = accent.startsWith("var(");
  // Hex accents support hex+alpha concatenation; CSS-var accents need
  // color-mix to tint. Both produce a translucent wash.
  const tint = (pct) => isVarAccent
    ? `color-mix(in srgb, ${accent} ${pct}%, transparent)`
    : accent + Math.round(pct * 255 / 100).toString(16).padStart(2, "0");
  return (
    <div
      role="status"
      aria-live="polite"
      className="pop-in"
      style={{
        position: "fixed",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        width: "calc(100% - 24px)",
        maxWidth: 520,
        padding: "14px 18px 14px 22px",
        borderRadius: "var(--border-radius-lg)",
        background: `linear-gradient(135deg, ${tint(13)} 0%, ${tint(4)} 100%), var(--color-background-primary)`,
        border: `0.5px solid ${tint(53)}`,
        boxShadow: "0 18px 44px rgba(0,0,0,0.32)",
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
          color: "var(--color-text-tertiary)",
          cursor: "pointer", lineHeight: 1,
        }}
      >
        ✕
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          width: 40, height: 40, borderRadius: 12,
          background: tint(20),
          border: `0.5px solid ${tint(33)}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
        }}>{v.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: accent, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 3,
          }}>{v.eyebrow}</div>
          <div style={{
            fontSize: 16, fontWeight: 600,
            color: "var(--color-text-primary)", lineHeight: 1.3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{v.title}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3, lineHeight: 1.4 }}>
            {v.sub}
          </div>
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
              cursor: "pointer", flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {v.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
