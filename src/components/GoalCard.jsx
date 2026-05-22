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

  // Recency line — only render when it carries signal. Three tiers of
  // colour escalation so the user gets a soft nudge before a full warning:
  //  0d           — success green ("active today")
  //  1–6d         — muted ("active Nd ago")
  //  7–13d        — warning yellow ("quiet for Nd") — early nudge
  //  14d+         — warning yellow w/ ⚠ ("stale · Nd inactive") — stronger
  let recencyText = null;
  let recencyColor = "var(--color-text-tertiary)";
  if (!done) {
    if (lastActivityDay) {
      const lastDays = Math.floor((new Date(todayStr()) - new Date(lastActivityDay)) / 86400000);
      if (lastDays === 0) { recencyText = "active today"; recencyColor = "var(--color-text-success)"; }
      else if (lastDays === 1) recencyText = "active yesterday";
      else if (lastDays < 7) recencyText = `active ${lastDays}d ago`;
      else if (lastDays < 14) { recencyText = `quiet for ${lastDays}d`; recencyColor = "var(--color-text-warning)"; }
      else { recencyText = `⚠ stale · ${lastDays}d inactive`; recencyColor = "var(--color-text-warning)"; }
    } else if (g.tasks?.length > 0) {
      recencyText = "no focus logged yet";
    }
  }

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`Goal: ${g.title}, ${p}% complete, ${statusText}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(); } }}
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            flex: 1,
            fontWeight: 500,
            fontSize: 16,
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: done ? "var(--color-text-tertiary)" : "transparent",
          }}
        >
          {g.title}
        </span>
        <span style={S.pill(catColor + "22", catColor)}>{g.category}</span>
      </div>
      <ProgressBar val={p} color={catColor} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 14, color: "var(--color-text-secondary)", gap: 8, flexWrap: "wrap" }}>
        <span>
          {(() => {
            const oneShots = g.tasks.filter((t) => !isRecurring(t));
            const habits = g.tasks.filter((t) => isRecurring(t));
            const oneShotPart = oneShots.length > 0
              ? `${oneShots.filter((t) => t.done).length}/${oneShots.length} tasks`
              : null;
            const habitPart = habits.length > 0
              ? `${habits.length} habit${habits.length === 1 ? "" : "s"}`
              : null;
            const parts = [oneShotPart, habitPart].filter(Boolean);
            const lead = parts.length > 0 ? parts.join(" · ") : "no tasks yet";
            return `${lead} · ${g.type === "short" ? "Short" : "Long"}-term`;
          })()}
        </span>
        <span style={{ color: statusColor, textAlign: "right" }}>
          {statusText}
          {done && (
            <span style={{ color: "var(--color-text-tertiary)", marginLeft: 6, fontSize: 13 }}>
              · was due {fmt(g.due)}
            </span>
          )}
        </span>
      </div>
      {recencyText && (
        <div style={{ marginTop: 5, fontSize: 12, color: recencyColor, fontStyle: "italic" }}>
          {recencyText}
        </div>
      )}
    </div>
  );
}
