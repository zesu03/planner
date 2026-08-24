import { DUE_PRESETS } from "../../lib/constants";
import { todayStr } from "../../lib/dates";
import Chip from "../Chip";

export default function DueChips({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {DUE_PRESETS.map((p) => {
        const presetValue = p.get();
        const active = value === presetValue;
        return (
          <Chip key={p.label} active={active} onClick={() => onChange(presetValue)}>
            {p.label}
          </Chip>
        );
      })}
      <input type="date" value={value || ""} min={todayStr()} onChange={(e) => onChange(e.target.value)}
        style={{ flex: "1 1 160px", minWidth: 140, fontSize: 14, padding: "6px 10px" }} />
    </div>
  );
}
