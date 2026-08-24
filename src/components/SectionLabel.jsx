// Section label — a serif title with a trailing hairline rule. The mockup's
// grouping device ("Daily Salah", "Accountability", …). Shared across views
// so section grouping reads identically everywhere.
export default function SectionLabel({ children, style }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 14px", ...style }}>
      <span className="serif" style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}
