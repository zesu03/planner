import { DUE_PRESETS } from "../../lib/constants";
import { todayStr } from "../../lib/dates";
import { goldA } from "../../lib/styles";

export default function DueChips({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {DUE_PRESETS.map((p) => {
        const presetValue = p.get();
        const active = value === presetValue;
        return (
          <button key={p.label} type="button" onClick={() => onChange(presetValue)}
            style={{
              background: active ? goldA(18) : "var(--color-background-secondary)",
              border: `0.5px solid ${active ? goldA(60) : "var(--color-border-tertiary)"}`,
              color: active ? "var(--gold)" : "var(--color-text-secondary)",
              borderRadius: 99,
              padding: "5px 12px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
            }}>
            {p.label}
          </button>
        );
      })}
      <input type="date" value={value || ""} min={todayStr()} onChange={(e) => onChange(e.target.value)}
        style={{ flex: "1 1 160px", minWidth: 140, fontSize: 14, padding: "6px 10px" }} />
    </div>
  );
}
