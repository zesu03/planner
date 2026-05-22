import { INTENTIONS } from "../../lib/constants";
import { goldA } from "../../lib/styles";

// Three tap-to-fill chips drawn from the canonical INTENTIONS list. Lets the
// user populate the Niyyah field without typing — also nudges towards a
// spiritually-anchored phrasing instead of a generic productivity goal.
export default function NiyyahChips({ onPick }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {INTENTIONS.slice(0, 3).map((i, idx) => (
        <button key={idx} type="button" onClick={() => onPick(i)}
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 99,
            background: "var(--color-background-secondary)",
            border: `0.5px solid ${goldA(20)}`,
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            maxWidth: "100%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
          {i.length > 40 ? i.slice(0, 40) + "…" : i}
        </button>
      ))}
    </div>
  );
}
