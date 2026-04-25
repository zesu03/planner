// Empty-state primitive used wherever a list or card is empty.
// `padY` controls top/bottom padding so it can be tucked into smaller cards.
export default function EmptyState({ icon, title, hint, padY = 28 }) {
  return (
    <div style={{ textAlign: "center", padding: `${padY}px 12px`, color: "var(--color-text-tertiary)" }}>
      <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.75 }}>{icon}</div>
      <div style={{ fontSize: 15, color: "var(--color-text-secondary)", fontWeight: 500, marginBottom: hint ? 4 : 0 }}>
        {title}
      </div>
      {hint && <div style={{ fontSize: 13, maxWidth: 340, margin: "0 auto", lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}
