import { gold } from "../../lib/styles";

export default function TypeToggle({ value, onChange }) {
  const opts = [
    { v: "short", label: "Short-term", hint: "≤ 3 months" },
    { v: "long",  label: "Long-term",  hint: "3 months+" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {opts.map((opt) => {
        const active = value === opt.v;
        return (
          <button key={opt.v} type="button" onClick={() => onChange(opt.v)}
            style={{
              background: active ? "rgba(201,168,76,0.18)" : "var(--color-background-secondary)",
              border: `0.5px solid ${active ? gold + "99" : "var(--color-border-tertiary)"}`,
              color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "10px 12px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              alignItems: "flex-start",
              transition: "all 0.15s",
            }}>
            <span style={{ fontSize: 14, fontWeight: active ? 600 : 500 }}>{opt.label}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
