// Daily-loop helpers — pure functions, no React. Power the Morning / Evening
// panels on the Dashboard.
//
// Phase logic: the day has three coarse phases. Morning is emphasised until
// Dhuhr (or noon if we don't have prayer times). Evening is emphasised from
// Maghrib (or 6pm fallback) onward. Midday in between renders both panels
// with neither emphasised — the user is mid-flight; nothing to nudge.

import { todayStr, localDateStr, addDays } from "./dates";

// Returns "morning" | "midday" | "evening". `prayerTimes` is optional — if
// present we use Dhuhr / Maghrib as the real boundaries; otherwise we fall
// back to 12:00 and 18:00.
export function dayPhase(prayerTimes, now = new Date()) {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const parse = (s) => {
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const dhuhr = parse(prayerTimes?.Dhuhr) ?? 12 * 60;
  const maghrib = parse(prayerTimes?.Maghrib) ?? 18 * 60;
  if (nowMins < dhuhr) return "morning";
  if (nowMins >= maghrib) return "evening";
  return "midday";
}

// Today's prayer completion summary.
// Returns { done: ["Fajr",...], missed: ["Dhuhr",...], doneCount, totalCount }.
// Only the five obligatory prayers — Sunrise is excluded.
export function prayersToday(prayerLog) {
  const five = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const today = todayStr();
  const done = [];
  const missed = [];
  for (const p of five) {
    if ((prayerLog?.[p] || []).includes(today)) done.push(p);
    else missed.push(p);
  }
  return { done, missed, doneCount: done.length, totalCount: five.length };
}

// Today's focus minutes summed from focusLog. Daily goal is from settings.
export function focusToday(focusLog, dailyGoalMins) {
  const today = todayStr();
  const mins = (focusLog || []).reduce((s, l) => l.day === today ? s + (l.mins || 0) : s, 0);
  const goal = Math.max(1, dailyGoalMins || 60);
  const pct = Math.min(100, Math.round((mins / goal) * 100));
  return { mins, goal, pct };
}

// Three-state muhasaba flag for a given day. "empty" — nothing recorded.
// "partial" — at least one field touched but not enough to feel "filled".
// "filled" — passes isMuhasabaFilled (kept here as a thin wrapper so panels
// don't import muhasaba.js directly).
export function muhasabaState(entry, isFilledFn) {
  if (!entry) return "empty";
  if (isFilledFn(entry)) return "filled";
  const touched = !!(
    entry.quranPages ||
    entry.dhikr ||
    entry.makeupNote ||
    entry.repentText ||
    (entry.sinTags && entry.sinTags.length) ||
    entry.ghaflahNote ||
    entry.niyyahRating ||
    entry.bestDeed ||
    (entry.shukr || []).some((s) => s && s.trim()) ||
    (entry.duaTomorrow && entry.duaTomorrow.trim())
  );
  return touched ? "partial" : "empty";
}

// Yesterday's du'a-for-tomorrow — i.e. the commitment the user wrote last
// night, which today is the test of. Returns null if blank.
export function yesterdayDua(muhasaba) {
  const yKey = addDays(-1);
  const dua = muhasaba?.[yKey]?.duaTomorrow;
  return dua && dua.trim() ? { day: yKey, text: dua.trim() } : null;
}

// Pick the first task to surface in the morning: first incomplete task of
// the earliest-due active goal. Handles both task flavours — for one-shot
// tasks "open" means !t.done; for recurring tasks "open" means scheduled
// today AND not ticked today (so a Mon/Thu habit on Wednesday isn't surfaced).
import { isRecurring, isScheduledOn, isDoneOn } from "./goals";
function isOpenToday(t) {
  if (isRecurring(t)) return isScheduledOn(t) && !isDoneOn(t);
  return !t.done;
}
export function firstOpenTask(goals) {
  // Goals without a due date sort last instead of poisoning the comparator
  // with NaN (Invalid Date), which would make the "earliest-due" pick
  // non-deterministic.
  const dueTime = (g) => { const t = +new Date(g.due); return Number.isNaN(t) ? Infinity : t; };
  const candidates = (goals || [])
    .filter((g) => !g.completedAt)
    .filter((g) => (g.tasks || []).some(isOpenToday))
    .sort((a, b) => dueTime(a) - dueTime(b));
  for (const g of candidates) {
    const t = (g.tasks || []).find(isOpenToday);
    if (t) return { goal: g, task: t };
  }
  return null;
}

// Minutes-until helper for the next prayer card inside the panels. Returns
// null if `target` is unparseable. Same anchor as Dashboard hero (local
// device wall-clock).
export function minsUntil(targetHHMM, now = new Date()) {
  if (!targetHHMM) return null;
  const [h, m] = targetHHMM.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return h * 60 + m - nowMins;
}

// localDateStr re-exported so panels don't reach into ../dates separately —
// keeps the daily-loop import surface tight.
export { localDateStr };
