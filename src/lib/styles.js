// Inline style tokens used across views.
//
// `gold` is the dark-theme literal — used in opacity-tinted decorations
// (e.g. `gold + "55"` borders) where a CSS var can't be concatenated. For
// solid colour fills/text, prefer `"var(--gold)"` so the value swaps with
// theme. Keep this in sync with `--gold` (dark) in src/index.css.
export const gold = "#c9a84c";
export const goldLight = "rgba(201,168,76,0.12)";

export const S = {
  card: {
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-lg)",
    padding: "var(--card-padding)",
  },
  goldCard: {
    background: "linear-gradient(135deg,rgba(201,168,76,0.18) 0%,rgba(201,168,76,0.06) 100%)",
    border: `0.5px solid ${gold}55`,
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
    borderBottom: active ? "2.5px solid " + gold : "2.5px solid transparent",
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
