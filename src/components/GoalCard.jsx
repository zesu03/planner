import { CAT_COLORS } from "../lib/constants";
import { daysLeft, fmt, todayStr } from "../lib/dates";
import { isGoalDone, pct, isRecurring } from "../lib/goals";
import { S } from "../lib/styles";
import ProgressBar from "./ProgressBar";

// Pure presentation. Caller passes:
//   g                    — the goal object
//   lastActivityDay      — most recent focusLog.day for this goal, or undefined
//   onSelect()           — invoked when the card is clicked
export default function GoalCard({ g, lastActivityDay, onSelect }) {
  const p = pct(g);
  const dl = daysLeft(g.due);
  const done = isGoalDone(g);
  const overdue = !done && dl < 0;
  const urgent = !done && dl >= 0 && dl <= 7;
  const onTime = done && g.completedAt && g.completedAt <= g.due;
  const catColor = CAT_COLORS[g.category];

  const statusColor = done
    ? onTime
      ? "var(--color-text-success)"
      : "var(--color-text-warning)"
    : overdue
    ? "var(--color-text-danger)"
    : urgent
    ? "var(--color-text-warning)"
    : "var(--color-text-secondary)";

  const statusText = done
    ? g.completedAt
      ? `✓ Completed ${fmt(g.completedAt)}`
      : "✓ Completed"
    : dl < 0
    ? `${Math.abs(dl)}d overdue`
    : dl === 0
    ? "Due today"
    : `${dl}d left`;

  // Recency — show only the two signals worth a line on a compact card: a
  // positive "active today", and the quiet/stale nudges. The in-between
  // ("yesterday", "Nd ago", "no focus yet") was noise on every card.
  let recencyText = null;
  let recencyColor = "var(--color-text-tertiary)";
  if (!done && lastActivityDay) {
    const lastDays = Math.floor((new Date(todayStr()) - new Date(lastActivityDay)) / 86400000);
    if (lastDays === 0) { recencyText = "active today"; recencyColor = "var(--color-text-success)"; }
    else if (lastDays >= 14) { recencyText = `⚠ stale · ${lastDays}d inactive`; recencyColor = "var(--color-text-warning)"; }
    else if (lastDays >= 7) { recencyText = `quiet for ${lastDays}d`; recencyColor = "var(--color-text-warning)"; }
  }

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`Goal: ${g.title}, ${p}% complete, ${statusText}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(); } }}
      className="tap-card"
      style={{
        ...S.card,
        position: "relative",
        paddingLeft: 24,
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.12s, box-shadow 0.18s",
        opacity: done ? 0.78 : 1,
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = catColor + "99";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = `0 8px 24px ${catColor}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-tertiary)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = catColor + "99"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-tertiary)"; }}
    >
      {/* category accent edge */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: catColor, opacity: done ? 0.5 : 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span
          style={{
            flex: 1,
            fontWeight: 600,
            fontSize: 16,
            lineHeight: 1.3,
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: done ? "var(--color-text-tertiary)" : "transparent",
          }}
        >
          {g.title}
        </span>
        <span style={S.pill(catColor + "22", catColor)}>{g.category}</span>
      </div>
      {/* progress bar + inline % — the numeric signal that used to live in a
          separate "Overall progress" card, folded onto the bar itself */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ProgressBar val={p} color={catColor} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: catColor, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {p}%
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, fontSize: 13, gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "var(--color-text-tertiary)" }}>
          {(() => {
            const tasks = g.tasks || [];
            const oneShots = tasks.filter((t) => !isRecurring(t));
            const habits = tasks.filter((t) => isRecurring(t));
            const oneShotPart = oneShots.length > 0
              ? `${oneShots.filter((t) => t.done).length}/${oneShots.length} tasks`
              : null;
            const habitPart = habits.length > 0
              ? `${habits.length} habit${habits.length === 1 ? "" : "s"}`
              : null;
            return [oneShotPart, habitPart].filter(Boolean).join(" · ") || "no tasks yet";
          })()}
          {recencyText && (
            <span style={{ color: recencyColor, fontStyle: "italic" }}> · {recencyText}</span>
          )}
        </span>
        <span style={{ color: statusColor, textAlign: "right", fontWeight: 500 }}>
          {statusText}
        </span>
      </div>
    </div>
  );
}
