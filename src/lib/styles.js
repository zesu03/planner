// Inline style tokens used across views.
//
// THEME-AWARE GOLD
// ----------------
// CSS doesn't let you concatenate a CSS variable with a hex-alpha suffix.
// In dark mode the gold is `#c9a84c`; in light mode it's `#7a5810`. The
// old approach — exporting `gold = "#c9a84c"` and doing `gold + "55"` —
// painted dark-theme gold dots/borders onto cream backgrounds in light
// mode. Wrong colour on the wrong palette.
//
// `goldA(percent)` returns a `color-mix()` expression that blends the
// theme's current `--gold` with transparent. The CSS engine resolves
// `var(--gold)` per-theme, so the result tints correctly in both modes.
// Browser support: Chrome 111+, Safari 16.2+, Firefox 113+ (May 2023).
//
// `gold` is preserved for the rare case where a JS-side hex string is
// genuinely needed (e.g. SVG stroke attribute). Prefer `goldA(N)` or
// `"var(--gold)"` for everything else.
export const gold = "#c9a84c";
// General-purpose opacity tint for ANY colour (hex, named, CSS var,
// color-mix). Replaces both the `gold + "55"` and the `pColor + "33"`
// patterns with a single helper that works for theme-aware tokens too.
export const tintA = (color, percent) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;
export const goldA = (percent) => tintA("var(--gold)", percent);
export const goldLight = goldA(12);
// Convenience for the two-stop gradient used as a soft gold wash. Kept
// here so call sites stop hard-coding `rgba(201,168,76,...)` literals.
export const goldWashGradient = (angle = "135deg") =>
  `linear-gradient(${angle}, ${goldA(18)} 0%, ${goldA(6)} 100%)`;

export const S = {
  card: {
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    padding: "var(--card-padding)",
  },
  goldCard: {
    background: goldWashGradient(),
    border: `0.5px solid ${goldA(33)}`,
    borderRadius: "var(--border-radius-lg)",
    padding: "var(--card-padding)",
  },
  pill: (bg, color) => ({
    display: "inline-block",
    fontSize: 13,
    padding: "3px 10px",
    borderRadius: 99,
    background: bg,
    color,
    fontWeight: 500,
    whiteSpace: "nowrap",
  }),
  tab: (active) => ({
    fontSize: 15,
    fontWeight: active ? 600 : 400,
    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    borderBottom: active ? "2.5px solid var(--gold)" : "2.5px solid transparent",
    borderRadius: 0,
    padding: "9px 0",
    marginRight: 22,
    background: "none",
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
    cursor: "pointer",
    letterSpacing: "0.2px",
  }),
  filterBtn: (active) => ({
    fontSize: 14,
    padding: "5px 16px",
    borderRadius: 99,
    background: active ? "var(--color-text-primary)" : "transparent",
    color: active ? "var(--color-background-primary)" : "var(--color-text-secondary)",
    border: "0.5px solid var(--color-border-secondary)",
    cursor: "pointer",
  }),
};
