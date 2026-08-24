import { CATEGORIES, CAT_COLORS } from "../../lib/constants";
import Chip from "../Chip";

export default function CategoryTiles({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {CATEGORIES.map((c) => {
        const active = value === c;
        const color = CAT_COLORS[c];
        return (
          <Chip key={c} active={active} accent={color} onClick={() => onChange(c)}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
            {c}
          </Chip>
        );
      })}
    </div>
  );
}
