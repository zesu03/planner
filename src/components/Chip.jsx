// Canonical pill toggle. Replaces the ad-hoc pill buttons that had drifted
// apart across the goal form (category / due / niyyah pickers) — one active
// treatment everywhere via the `.chip` / `.chip--active` classes in
// index.css. `accent` tints the active + hover state per context (the gold
// primary by default; a category colour for CategoryTiles).
export default function Chip({
  active = false,
  onClick,
  accent = "var(--gold)",
  children,
  title,
  disabled = false,
  style,
  ...rest
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`chip${active ? " chip--active" : ""}`}
      style={{ "--chip-accent": accent, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
