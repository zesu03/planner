import { INTENTIONS } from "../../lib/constants";
import Chip from "../Chip";

// Three tap-to-fill chips drawn from the canonical INTENTIONS list. Lets the
// user populate the Niyyah field without typing — also nudges towards a
// spiritually-anchored phrasing instead of a generic productivity goal.
export default function NiyyahChips({ onPick }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {INTENTIONS.slice(0, 3).map((i, idx) => (
        <Chip
          key={idx}
          onClick={() => onPick(i)}
          title={i}
          style={{ display: "inline-block", fontSize: 12, padding: "4px 10px", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {i.length > 40 ? i.slice(0, 40) + "…" : i}
        </Chip>
      ))}
    </div>
  );
}
