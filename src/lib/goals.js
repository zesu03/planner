// Pure helpers over the goal data model.
//
// TASK SHAPES
// -----------
// Two flavours coexist in the same `tasks[]` array on a goal:
//
//   1. One-shot task (default; legacy shape stays here):
//        { id, text, priority, eta, done: bool, sessions, totalTime }
//
//   2. Recurring task (habit):
//        { id, text, priority, eta, sessions, totalTime,
//          recurring: { type: "daily" | "weekly", days?: [0..6] },
//          completions: ["YYYY-MM-DD", ...] }
//
// For weekly tasks, `days` is an array of JS day-of-week numbers
// (0 = Sunday, 1 = Monday, …, 6 = Saturday). E.g. Mondays + Thursdays
// for the classical Sunnah fasts: { type: "weekly", days: [1, 4] }.
//
// A recurring task's `done` field (if present from legacy) is ignored —
// today's tick comes from `completions.includes(todayStr())`. The task is
// "completed today" only on dates the user explicitly ticked.

import { todayStr, localDateStr } from "./dates";

export const isRecurring = (t) => !!t?.recurring?.type;

// Is the task scheduled for `dayStr` (YYYY-MM-DD, defaults to today)?
// Non-recurring tasks are always "scheduled" (you can always work on them).
// Daily-recurring is always scheduled. Weekly is scheduled iff the JS
// day-of-week is in `recurring.days`.
export const isScheduledOn = (t, dayStr) => {
  if (!isRecurring(t)) return true;
  if (t.recurring.type === "daily") return true;
  if (t.recurring.type === "weekly") {
    const days = Array.isArray(t.recurring.days) ? t.recurring.days : [];
    if (days.length === 0) return true; // weekly with no specific days = every day
    // Parse "YYYY-MM-DD" with the local-time Date constructor so getDay()
    // returns the calendar day-of-week the user actually sees (0=Sun..6=Sat).
    const [y, m, d] = (dayStr || todayStr()).split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return days.includes(dow);
  }
  return false;
};

// "Is this task done on `dayStr`?" For one-shot tasks this just reads
// `done`. For recurring tasks it checks the completions array.
export const isDoneOn = (t, dayStr) => {
  if (!isRecurring(t)) return !!t.done;
  const key = dayStr || todayStr();
  return (t.completions || []).includes(key);
};

// Consecutive scheduled days back from today that were completed. Skips
// days the task wasn't scheduled on (e.g. for Mon/Thu weekly, walks back
// only Mondays and Thursdays). Caps walk at 400 days.
export const recurringStreak = (t) => {
  if (!isRecurring(t)) return 0;
  const completions = new Set(t.completions || []);
  let streak = 0;
  const cur = new Date();
  for (let i = 0; i < 400; i++) {
    const dayStr = localDateStr(cur);
    if (isScheduledOn(t, dayStr)) {
      if (completions.has(dayStr)) streak++;
      else if (i > 0) break; // today not ticked yet doesn't break the streak
    }
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
};

// Completion rate (0..1) over the last `windowDays` scheduled days.
// Useful for the AI mirror to gauge habit health independent of streaks
// (which break on a single miss).
export const recurringCompletionRate = (t, windowDays = 30) => {
  if (!isRecurring(t)) return null;
  const completions = new Set(t.completions || []);
  let scheduled = 0;
  let done = 0;
  const cur = new Date();
  for (let i = 0; i < windowDays; i++) {
    const dayStr = localDateStr(cur);
    if (isScheduledOn(t, dayStr)) {
      scheduled++;
      if (completions.has(dayStr)) done++;
    }
    cur.setDate(cur.getDate() - 1);
  }
  return scheduled === 0 ? null : done / scheduled;
};

// Display helpers ---------------------------------------------------------

// Short / long day-of-week labels indexed by JS getDay() (0 = Sunday).
export const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
export const DOW_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Human-readable schedule string for a recurring task — "Daily" or
// "Mon, Thu" etc. Returns null for non-recurring tasks.
export const scheduleLabel = (recurring) => {
  if (!recurring) return null;
  if (recurring.type === "daily") return "Daily";
  if (recurring.type === "weekly") {
    const days = recurring.days || [];
    if (days.length === 0) return "Weekly";
    if (days.length === 7) return "Daily";
    return days.slice().sort().map((d) => DOW_LONG[d]).join(", ");
  }
  return null;
};

// Goal lifecycle helpers ---------------------------------------------------

// Recurring tasks never "complete" — they're ongoing. So they're excluded
// from both the progress percentage and the auto-complete check. A goal
// with only recurring tasks can never auto-flip to completed; it has to
// be marked complete manually if at all (and many habit goals stay open
// indefinitely, which is correct).
export const oneShotTasks = (g) => (g?.tasks || []).filter((t) => !isRecurring(t));
export const recurringTasks = (g) => (g?.tasks || []).filter((t) => isRecurring(t));

// A goal is "done" when:
//   - completedAt was explicitly stamped (manual Mark complete), OR
//   - it has at least one one-shot task and every one-shot task is done.
// Recurring tasks are ignored — they don't gate completion.
export const isGoalDone = (g) => {
  if (!g) return false;
  if (g.completedAt) return true;
  const oneShots = oneShotTasks(g);
  return oneShots.length > 0 && oneShots.every((t) => t.done);
};

// Progress percent — based on one-shot tasks only. Returns 0 when a goal
// has no one-shot tasks (habit-only goals show 0% and live by their
// per-habit streaks, not by goal-level progress).
export const pct = (g) => {
  const oneShots = oneShotTasks(g);
  if (oneShots.length === 0) return 0;
  return Math.round((oneShots.filter((t) => t.done).length / oneShots.length) * 100);
};
