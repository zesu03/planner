import { CATEGORIES, CAT_COLORS } from "../../lib/constants";

export default function CategoryTiles({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {CATEGORIES.map((c) => {
        const active = value === c;
        const color = CAT_COLORS[c];
        return (
          <button key={c} type="button" onClick={() => onChange(c)}
            style={{
              background: active ? color + "33" : "var(--color-background-secondary)",
              border: `0.5px solid ${active ? color : "var(--color-border-tertiary)"}`,
              color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              borderRadius: 99,
              padding: "6px 12px 6px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 14,
              transition: "all 0.15s",
            }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
            {c}
          </button>
        );
      })}
    </div>
  );
}
