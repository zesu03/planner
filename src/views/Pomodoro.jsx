import { useState } from "react";
import { CAT_COLORS } from "../lib/constants";
import { todayStr, addDays, localDateStr } from "../lib/dates";
import { fmtTime, fmtMins, getFocusSeconds } from "../lib/focus";
import { isGoalDone } from "../lib/goals";
import { getAudioCtx } from "../lib/audio";
import { S } from "../lib/styles";

// Sum focusLog minutes for a YYYY-MM-DD key.
function minsForDay(focusLog, dayKey) {
  return focusLog.reduce((s, l) => (l.day === dayKey ? s + (l.mins || 0) : s), 0);
}

// Streak = consecutive days hitting `goalMins`. Today not yet hit doesn't
// break the count (so the streak survives mid-day before the user finishes).
function computeStreak(focusLog, goalMins) {
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i++) {
    const k = localDateStr(cursor);
    const m = minsForDay(focusLog, k);
    if (m >= goalMins) {
      streak++;
    } else if (i > 0) {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Daily progress: today's mins toward the goal, yesterday's total, streak,
// and a 7-day mini bar chart so the user sees the week at a glance.
// Designed to sit beside the timer dial as a sibling block.
function DailyProgress({ focusLog, todayMins, yesterdayMins, streak, goalMins, onEditGoal, style }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goalMins));

  const pct = Math.min(1, todayMins / Math.max(1, goalMins));
  const RING = 156;
  const R = 70;
  const C = 2 * Math.PI * R;
  const goalH = Math.floor(goalMins / 60);
  const goalM = goalMins % 60;
  const goalSplit = goalH && !goalM
    ? { value: String(goalH), unit: goalH === 1 ? "hour" : "hours" }
    : goalH
      ? { value: `${goalH}:${String(goalM).padStart(2, "0")}`, unit: "h" }
      : { value: String(goalM), unit: "min" };

  const commit = () => {
    const v = Math.max(1, Math.min(720, Number(draft) || goalMins));
    onEditGoal(v);
    setEditing(false);
  };

  return (
    <div style={{ ...S.card, display: "flex", flexDirection: "column", justifyContent: "center", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>Daily progress</div>
        {!editing && (
          <button onClick={() => { setDraft(String(goalMins)); setEditing(true); }}
            title="Edit daily goal"
            style={{
              fontSize: 13,
              padding: "4px 8px",
              background: "transparent",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 8,
              cursor: "pointer",
              color: "var(--color-text-secondary)",
            }}>
            ✎
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
            Yesterday
          </div>
          <div style={{ fontSize: 26, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1 }}>
            {yesterdayMins}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            minutes
          </div>
        </div>

        <div style={{ position: "relative", width: RING, height: RING, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={{ position: "absolute", inset: 0 }}>
            <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="var(--color-background-secondary)" strokeWidth="10" />
            <circle cx={RING / 2} cy={RING / 2} r={R} fill="none"
              stroke="var(--gold)"
              strokeWidth="10"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              strokeLinecap="round"
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              style={{ transition: "stroke-dashoffset 0.5s" }} />
          </svg>
          <div style={{ position: "relative", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 2 }}>
              Daily goal
            </div>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    else if (e.key === "Escape") setEditing(false);
                  }}
                  autoFocus
                  style={{ width: 60, fontSize: 18, textAlign: "center", padding: "2px 4px" }}
                />
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={commit} className="btn-primary" style={{ padding: "4px 10px", fontSize: 12 }}>Save</button>
                  <button onClick={() => setEditing(false)} style={{ padding: "4px 10px", fontSize: 12 }}>Cancel</button>
                </div>
                <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>minutes</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 30, fontWeight: 500, color: "var(--gold)", lineHeight: 1 }}>
                  {goalSplit.value}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                  {goalSplit.unit}
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
            Streak
          </div>
          <div style={{ fontSize: 26, fontWeight: 500, color: streak > 0 ? "var(--gold)" : "var(--color-text-primary)", lineHeight: 1 }}>
            {streak}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            {streak === 1 ? "day" : "days"}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: todayMins >= goalMins ? "var(--color-text-success)" : "var(--color-text-secondary)" }}>
        {todayMins >= goalMins
          ? `Goal reached · ${todayMins} minute${todayMins === 1 ? "" : "s"} today`
          : `Completed: ${todayMins} minute${todayMins === 1 ? "" : "s"}`}
      </div>

      {/* 7-day mini bar chart — last 7 days oldest→newest, today on the right.
          Bar height is mins / max-of-(window or goal). Bars at or above goal
          are gold; below are muted. */}
      {(() => {
        const DAYS = 7;
        const days = [];
        for (let i = DAYS - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const k = localDateStr(d);
          days.push({ key: k, mins: minsForDay(focusLog, k), label: d.toLocaleDateString("en", { weekday: "narrow" }), isToday: i === 0 });
        }
        const max = Math.max(goalMins, ...days.map(d => d.mins), 1);
        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "0.5px dashed var(--color-border-tertiary)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 6, height: 56 }}>
              {days.map((d) => {
                const h = (d.mins / max) * 100;
                const hit = d.mins >= goalMins && goalMins > 0;
                return (
                  <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${d.key} · ${d.mins}m`}>
                    <div style={{ width: "100%", height: 40, display: "flex", alignItems: "flex-end" }}>
                      <div style={{
                        width: "100%",
                        height: `${Math.max(2, h)}%`,
                        background: hit ? "var(--gold)" : "var(--color-background-secondary)",
                        border: d.isToday ? `1px solid ${hit ? "var(--gold)" : "var(--color-border-secondary)"}` : "none",
                        borderRadius: 3,
                        transition: "height 0.4s ease",
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: d.isToday ? "var(--gold)" : "var(--color-text-tertiary)", fontWeight: d.isToday ? 600 : 400 }}>
                      {d.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Focus tab. Two side-by-side blocks: the dial (with the active task / niyyah
// inside) and Daily progress. No break mode, no separate settings card —
// when no task is linked, focus length is editable inline beneath the dial.
export default function Pomodoro({
  goals,
  focusLog,
  activeTask,
  pomGoalId,
  pomTaskId,
  pomSeconds,
  pomRunning,
  pomDurations,
  pomFocusTargetMins,
  setPomRunning,
  stopTimer,
  resetTimer,
  endFocusEarly,
  updatePomDuration,
  startTaskTimer,
  dailyFocusGoalMins,
  updateDailyFocusGoal,
}) {
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState(String(pomDurations.defaultFocus));

  // Dial geometry.
  const DIAL = 280;
  const DIAL_R = 110;
  const DIAL_C = 2 * Math.PI * DIAL_R;
  const total = getFocusSeconds(pomFocusTargetMins, pomDurations);
  const prog = total > 0 ? (total - pomSeconds) / total : 0;
  // Paused = the user pressed Start at least once (progress > 0) but the
  // timer is currently stopped. Idle = at full time, never started. Both
  // are "not running" but they need different visual signals.
  const paused = !pomRunning && prog > 0 && prog < 1;

  const activeGoal = pomGoalId ? goals.find((g) => g.id === pomGoalId) : null;
  const ringColor = activeGoal ? CAT_COLORS[activeGoal.category] : "var(--gold)";

  const upcoming = goals
    .filter((g) => !isGoalDone(g))
    .flatMap((g) =>
      g.tasks
        .filter((t) => !t.done && !(g.id === pomGoalId && t.id === pomTaskId))
        .map((t) => ({ g, t }))
    )
    .sort((a, b) => new Date(a.g.due) - new Date(b.g.due))
    .slice(0, 5);

  const today = todayStr();
  const yKey = addDays(-1);
  const todayMins = minsForDay(focusLog, today);
  const yesterdayMins = minsForDay(focusLog, yKey);
  const streak = computeStreak(focusLog, dailyFocusGoalMins);

  const handleStart = () => {
    if (pomRunning) {
      stopTimer();
    } else {
      // Pre-warm AudioContext under the click so the end chime can fire later.
      getAudioCtx();
      setPomRunning(true);
    }
  };

  const commitFocusLength = () => {
    const v = Math.max(1, Number(focusDraft) || pomDurations.defaultFocus);
    updatePomDuration("defaultFocus", v);
    setEditingFocus(false);
  };

  return (
    <div className="view-content">
      <div style={{ ...S.goldCard, textAlign: "center", marginBottom: 16, padding: "14px 20px" }}>
        <div style={{ fontSize: 13, color: "var(--gold)", marginBottom: 4, fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase" }}>
          Reminder
        </div>
        <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--color-text-secondary)" }}>
          Make your intention before you begin — this effort is for Allah.
        </div>
      </div>

      {/* Dial + Daily progress side-by-side; stack on narrow screens. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        {/* Focus block */}
        <div style={{ ...S.card, flex: "1 1 360px", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px" }}>
          <div style={{ position: "relative", width: DIAL, height: DIAL, marginBottom: 4 }}>
            <div
              aria-hidden
              className={pomRunning ? "dial-breath" : ""}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: DIAL + 60,
                height: DIAL + 60,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(201,168,76,0.18) 0%, transparent 65%)",
                opacity: pomRunning ? 0.7 : 0.25,
                pointerEvents: "none",
                transition: "opacity 0.4s ease",
              }}
            />
            <svg width={DIAL} height={DIAL} viewBox={`0 0 ${DIAL} ${DIAL}`}
              role="timer"
              aria-label={`Focus timer ${paused ? "paused" : pomRunning ? "running" : "ready"}: ${fmtTime(pomSeconds)} remaining`}
              style={{ position: "relative" }}>
              <circle cx={DIAL / 2} cy={DIAL / 2} r={DIAL_R}
                fill="none" stroke="var(--color-background-secondary)" strokeWidth="12" />
              <circle cx={DIAL / 2} cy={DIAL / 2} r={DIAL_R}
                fill="none"
                stroke={ringColor}
                strokeWidth="12"
                strokeDasharray={DIAL_C}
                strokeDashoffset={DIAL_C * (1 - prog)}
                strokeLinecap="round"
                transform={`rotate(-90 ${DIAL / 2} ${DIAL / 2})`}
                opacity={paused ? 0.45 : 1}
                style={{ transition: "stroke-dashoffset 0.5s, stroke 0.3s, opacity 0.3s" }} />
              <text x={DIAL / 2} y={DIAL / 2 - 6} textAnchor="middle"
                opacity={paused ? 0.6 : 1}
                style={{ fontSize: 52, fontWeight: 500, fill: "var(--color-text-primary)", fontFamily: "monospace", transition: "opacity 0.3s" }}>
                {fmtTime(pomSeconds)}
              </text>
              <text x={DIAL / 2} y={DIAL / 2 + 26} textAnchor="middle"
                style={{ fontSize: 14, fill: paused ? "var(--color-text-warning)" : "var(--color-text-secondary)", letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: paused ? 600 : 400, transition: "fill 0.3s" }}>
                {paused ? "paused" : "focus"}
              </text>
            </svg>
          </div>

          {/* Inline focus-length editor — only when no task is linked. With a
              task linked, the task's ETA drives the dial and this is hidden. */}
          {!pomTaskId && (
            <div style={{ marginTop: 6, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase" }}>
                Focus length
              </span>
              {editingFocus ? (
                <>
                  <input
                    type="number"
                    min="1"
                    value={focusDraft}
                    onChange={(e) => setFocusDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitFocusLength();
                      else if (e.key === "Escape") setEditingFocus(false);
                    }}
                    autoFocus
                    style={{ width: 64, fontSize: 14, padding: "4px 8px", textAlign: "center" }}
                  />
                  <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>min</span>
                  <button onClick={commitFocusLength} className="btn-primary" style={{ padding: "4px 10px", fontSize: 12 }}>
                    Save
                  </button>
                  <button onClick={() => setEditingFocus(false)} style={{ padding: "4px 10px", fontSize: 12 }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setFocusDraft(String(pomDurations.defaultFocus)); setEditingFocus(true); }}
                  disabled={pomRunning}
                  title={pomRunning ? "Pause to change focus length" : "Click to change"}
                  style={{
                    fontSize: 14,
                    padding: "4px 12px",
                    borderRadius: 99,
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid var(--color-border-tertiary)",
                    color: pomRunning ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                    cursor: pomRunning ? "not-allowed" : "pointer",
                    fontWeight: 500,
                  }}>
                  {pomDurations.defaultFocus} min ✎
                </button>
              )}
            </div>
          )}

          {/* Working on (task linked) */}
          {activeTask && activeGoal && (
            <div style={{ textAlign: "center", marginTop: 10, width: "100%" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
                Working on
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)" }}>
                {activeTask.text}
              </div>
              <div style={{ fontSize: 13, color: CAT_COLORS[activeGoal.category], marginTop: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: CAT_COLORS[activeGoal.category], display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />
                {activeGoal.title} · ETA {activeTask.eta}m
              </div>
              {activeGoal.intention && (
                <div style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--color-text-primary)",
                  background: "linear-gradient(135deg, rgba(201,168,76,0.10) 0%, rgba(201,168,76,0.03) 100%)",
                  border: "0.5px solid rgba(201,168,76,0.28)",
                  borderRadius: "var(--border-radius-md)",
                  lineHeight: 1.55,
                }}>
                  <span style={{ color: "var(--gold)", fontStyle: "normal", fontWeight: 600, fontSize: 11, letterSpacing: "0.5px", textTransform: "uppercase", marginRight: 6 }}>
                    Niyyah
                  </span>
                  {activeGoal.intention}
                </div>
              )}
            </div>
          )}
          {!activeTask && (
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center" }}>
              No task linked · general focus block
            </div>
          )}
        </div>

        {/* Daily progress block */}
        <DailyProgress
          focusLog={focusLog}
          todayMins={todayMins}
          yesterdayMins={yesterdayMins}
          streak={streak}
          goalMins={dailyFocusGoalMins}
          onEditGoal={updateDailyFocusGoal}
          style={{ flex: "1 1 360px" }}
        />
      </div>

      {/* primary controls — full width below both blocks */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        <button onClick={handleStart} className="btn-primary" style={{ padding: "11px 36px" }}>
          {pomRunning ? "Pause" : "Bismillah — Start"}
        </button>
        <button
          onClick={resetTimer}
          title={pomTaskId ? "Delink the task and keep your remaining time" : "Reset to default focus length"}
          style={{ fontSize: 16, padding: "9px 18px" }}>
          Reset
        </button>
        {pomRunning && (
          <button onClick={endFocusEarly} style={{ fontSize: 16, padding: "9px 18px" }}>
            End focus
          </button>
        )}
      </div>

      {/* Up next */}
      {upcoming.length > 0 && (
        <div style={{ ...S.card }}>
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 10 }}>
            Up next
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map(({ g, t }) => {
              const cat = CAT_COLORS[g.category];
              return (
                <div key={`${g.id}:${t.id}`} className="tile-hover"
                  onClick={() => startTaskTimer(g.id, t.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Start focus on ${t.text} from ${g.title}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startTaskTimer(g.id, t.id); } }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--border-radius-md)",
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid transparent",
                    cursor: "pointer",
                  }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.text}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.title} · {fmtMins(t.eta || 30)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: cat,
                    border: `0.5px solid ${cat}66`,
                    padding: "3px 10px",
                    borderRadius: 99,
                    flexShrink: 0,
                  }}>
                    Start ›
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
