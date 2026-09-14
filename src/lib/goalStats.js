// Pure per-goal derivations for the GoalDetail view. Extracted verbatim from
// the inline IIFEs in views/GoalDetail.jsx so they can be unit tested. No
// React, no state, no side effects.
//
// Each takes an optional `today` (YYYY-MM-DD, defaults to todayStr()) so tests
// can pin the window deterministically. With the default the behaviour is
// identical to the component's prior inline computation.

import { todayStr, localDateStr } from "./dates";

// Per-task focus aggregates derived from focusLog — the SINGLE SOURCE OF
// TRUTH for a task's logged minutes / session count. (Tasks no longer store
// `totalTime` / `sessions`; deleting a session just drops its focusLog entry
// and these numbers fall out correctly, so the two accountings can't drift.)
// Returns a map keyed by taskId: { [taskId]: { mins, sessions, todayMins, lastDay } }.
export function focusStatsByTask(focusLog, today = todayStr()) {
  const map = {};
  for (const l of focusLog || []) {
    if (!l.taskId) continue;
    const m = map[l.taskId] || (map[l.taskId] = { mins: 0, sessions: 0, todayMins: 0, lastDay: null });
    const mins = l.mins || 0;
    m.mins += mins;
    m.sessions += 1;
    if (l.day === today) m.todayMins += mins;
    if (!m.lastDay || l.day > m.lastDay) m.lastDay = l.day;
  }
  return map;
}

// Minutes logged against a single task. `todayOnly` scopes to today's date —
// used for the per-DAY ETA budget of a recurring habit (whose lifetime total
// would otherwise drain the budget permanently after a few days).
export function taskLoggedMins(focusLog, taskId, { todayOnly = false, today = todayStr() } = {}) {
  let mins = 0;
  for (const l of focusLog || []) {
    if (l.taskId !== taskId) continue;
    if (todayOnly && l.day !== today) continue;
    mins += l.mins || 0;
  }
  return mins;
}

// Focus rhythm — windowed aggregates from focusLog for one goal. The 7d/30d
// totals here are recent-window only ("rhythm"); the "Logged" tile shows the
// lifetime total (also derived from focusLog via focusStatsByTask). Returns a
// 14-day series (oldest → newest) for the sparkline.
export function focusRhythm(focusLog, goalId, today = todayStr()) {
  const log = (focusLog || []).filter((l) => l.goalId === goalId);
  if (log.length === 0) {
    return { last7Mins: 0, last30Mins: 0, lastActivityDay: null, series: [] };
  }
  const cutoff7 = (() => {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 6);
    return localDateStr(d);
  })();
  const cutoff30 = (() => {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 29);
    return localDateStr(d);
  })();
  let last7 = 0, last30 = 0, lastDay = null;
  for (const l of log) {
    const mins = l.mins || 0;
    if (l.day >= cutoff30) last30 += mins;
    if (l.day >= cutoff7) last7 += mins;
    if (!lastDay || l.day > lastDay) lastDay = l.day;
  }
  // 14-day series, oldest → newest.
  const DAYS = 14;
  const series = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - i);
    const k = localDateStr(d);
    const mins = log.filter((l) => l.day === k).reduce((s, l) => s + (l.mins || 0), 0);
    series.push({ day: k, mins });
  }
  return { last7Mins: last7, last30Mins: last30, lastActivityDay: lastDay, series };
}

// 7-day Muhasaba verdict strip for a goal. During nightly muhasaba the user
// answers "did you make progress on this goal today?" — yes / partial / no,
// stored on the day's entry under goalChecks[goalId]. Walks back 7 days from
// today; empty cells mean no muhasaba on that day (not a "no"). Returns null
// when muhasaba is absent entirely.
export function goalChecksWindow(muhasaba, goalId, today = todayStr()) {
  if (!muhasaba) return null;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const k = localDateStr(d);
    const verdict = muhasaba?.[k]?.goalChecks?.[goalId] || null;
    days.push({ day: k, verdict });
  }
  const counts = days.reduce((acc, d) => {
    if (d.verdict) acc[d.verdict] = (acc[d.verdict] || 0) + 1;
    return acc;
  }, {});
  const total = (counts.yes || 0) + (counts.partial || 0) + (counts.no || 0);
  return { days, counts, total };
}

// Relative-day label for a goal's most recent focus day ("today" /
// "yesterday" / "Nd ago"), or null when there's been no activity. Takes the
// bare lastActivityDay string (from focusRhythm) rather than the whole object.
export function lastActivityLabel(lastActivityDay, today = todayStr()) {
  if (!lastActivityDay) return null;
  if (lastActivityDay === today) return "today";
  const t = new Date(`${today}T12:00:00Z`);
  const last = new Date(`${lastActivityDay}T12:00:00Z`);
  const days = Math.round((t - last) / 86400000);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}
