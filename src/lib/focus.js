// Pomodoro / focus timer helpers — pure conversions only.

export const getSecondsFromMinutes = (mins) => Math.max(0, Math.round(mins)) * 60;

export const getFocusSeconds = (taskEta, durations) =>
  getSecondsFromMinutes(taskEta || durations.defaultFocus);

export const getBreakSeconds = (durations) => getSecondsFromMinutes(durations.break);

// "MM:SS" — used by the timer display.
export const fmtTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// "1h 23m" / "45m" — used in stats and elsewhere.
export const fmtMins = (m) =>
  m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? m % 60 + "m" : ""}`.trim() : `${m}m`;

import { localDateStr } from "./dates";

// Consecutive days backwards from today that have at least `goalMins` of
// focus. Today not yet meeting the goal doesn't break the streak — lets
// the user see yesterday's count survive mid-day before they finish today.
// Walks at most 400 days back (multi-year cap is plenty for a streak).
export const focusStreakDays = (focusLog, goalMins) => {
  if (!focusLog || focusLog.length === 0) return 0;
  const goal = Math.max(1, goalMins || 60);
  // Pre-index focusLog by day so the inner loop is O(1) instead of O(n).
  const minsByDay = focusLog.reduce((acc, l) => {
    if (!l.day) return acc;
    acc[l.day] = (acc[l.day] || 0) + (l.mins || 0);
    return acc;
  }, {});
  let streak = 0;
  const cur = new Date();
  for (let i = 0; i < 400; i++) {
    const k = localDateStr(cur);
    const m = minsByDay[k] || 0;
    if (m >= goal) streak++;
    else if (i > 0) break;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
};

// Round-number streak milestones used by celebration toasts.
export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 200, 365];

// Sum focusLog minutes for a YYYY-MM-DD key. (Moved from views/Pomodoro.jsx.)
export function minsForDay(focusLog, dayKey) {
  return focusLog.reduce((s, l) => (l.day === dayKey ? s + (l.mins || 0) : s), 0);
}

// Parse a duration the user typed into minutes. Accepts plain minutes ("90"),
// hours ("2h", "1.5h"), and hours+minutes ("2h30", "2:30"). Returns null when
// it can't parse, so callers can fall back to the previous value.
export function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m;
  // "2h30", "2:30", "2h30m"
  if ((m = s.match(/^(\d+)(?:h|:)(\d+)m?$/))) return (+m[1]) * 60 + (+m[2]);
  // "2h", "1.5h"
  if ((m = s.match(/^(\d*\.?\d+)h$/))) return Math.round(parseFloat(m[1]) * 60);
  // "90m", "90"
  if ((m = s.match(/^(\d+)m?$/))) return +m[1];
  return null;
}

// Format minutes as a compact duration for an input value: "90" stays "90",
// but 120 -> "2h", 150 -> "2h30". Keeps the edit field friendly.
export function durationInputValue(mins) {
  if (mins % 60 === 0 && mins >= 60) return `${mins / 60}h`;
  if (mins > 60) return `${Math.floor(mins / 60)}h${mins % 60}`;
  return String(mins);
}
