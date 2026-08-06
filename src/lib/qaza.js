// Qaza ledger — per-prayer count of missed-prayer makeups still owed.
//
// ── v2: explicit stored counter (not derived) ──────────────────────────
// `owed[p]` is the source of truth for outstanding qaza. It is NOT recomputed
// from prayerLog on every render (the old v1 model) — instead a once-per-day
// "settle" pass materialises missed prayers into `owed` at day rollover:
//
//   - Today's prayers are PENDING — never counted. You can mark them prayed
//     (on time or late) all day; nothing enters the ledger until the day ends.
//   - At the next open, settleQaza walks every not-yet-settled past day up to
//     yesterday and adds +1 to owed[p] for each fard prayer not logged that
//     day (unless the day is excused — see `excused`). `lastSettledDate`
//     advances so re-runs are idempotent.
//
// This decouples "did I log it" from "do I owe a makeup": a logging lapse no
// longer silently manufactures qaza mid-day, overpayment is impossible
// (makeups pay down a real number, clamped at 0), and a historical backlog is
// just `owed += N`. Retroactively marking a settled day prayed clears its qaza
// via qazaAfterRetroToggle; marking a range excused un-counts it via
// addExcusedRange.
//
// Sunrise is not a prayer — never included. Menstruation / post-natal
// bleeding, travel, illness etc. are handled by `excused` ranges (obligatory
// prayers missed during menses are not made up — agreed across the madhahib).

import { todayStr, eachDayBetween, addDaysToStr } from "./dates";

export const QAZA_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
export const QAZA_VERSION = 2;

const zeroCounts = () => ({ Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 });

// A fresh ledger. startDate anchors counting to "from today forward" so a new
// user's pre-existing prayerLog gaps don't spawn a wall of qaza; lastSettledDate
// is yesterday so the first settle pass is a no-op until today rolls over.
export const emptyQaza = () => ({
  version: QAZA_VERSION,
  startDate: todayStr(),
  lastSettledDate: addDaysToStr(todayStr(), -1),
  owed: zeroCounts(),
  paidTotal: zeroCounts(),
  // Per-day makeups keyed by YYYY-MM-DD → { Fajr: n, ... }. Powers "N made up
  // today" and scopes the undo (−) button to today's makeups only.
  paidLog: {},
  // Inclusive excused ranges [{ from, to, reason }] — days excluded from
  // accrual (hayd/nifas, travel, illness, unconsciousness).
  excused: [],
});

// Outstanding makeups per prayer — reads the stored counter (with a zeroed
// fallback so a legacy/blank ledger is safe to spread).
export function qazaOwed(qaza) {
  return { ...zeroCounts(), ...(qaza?.owed || {}) };
}

// How many qaza the user marked made-up on `day` (default today), summed
// across the five prayers. 0 for a ledger with no paidLog.
export function paidOnDay(qaza, day = todayStr()) {
  const byPrayer = qaza?.paidLog?.[day];
  if (!byPrayer) return 0;
  return QAZA_PRAYERS.reduce((s, p) => s + (byPrayer[p] || 0), 0);
}

// Is `day` (YYYY-MM-DD) inside any excused range?
export function isExcused(day, excused = []) {
  return (excused || []).some((r) => r && r.from <= day && day <= r.to);
}

// Materialise missed prayers from (lastSettledDate, yesterday] into `owed`.
// Pure: returns a new ledger when something settles, otherwise the same
// reference (so callers can skip a redundant write). Never touches today.
export function settleQaza(qaza, prayerLog = {}, today = todayStr()) {
  if (!qaza?.startDate) return qaza;
  const yesterday = addDaysToStr(today, -1);
  let from = qaza.lastSettledDate ? addDaysToStr(qaza.lastSettledDate, 1) : qaza.startDate;
  if (from < qaza.startDate) from = qaza.startDate;
  if (from > yesterday) return qaza; // nothing new to settle
  const owed = qazaOwed(qaza);
  const excused = qaza.excused || [];
  // eachDayBetween is [start, end) — bump end past yesterday to include it.
  for (const day of eachDayBetween(from, addDaysToStr(yesterday, 1))) {
    if (isExcused(day, excused)) continue;
    for (const p of QAZA_PRAYERS) {
      if (!(prayerLog[p] || []).includes(day)) owed[p]++;
    }
  }
  return { ...qaza, owed, lastSettledDate: yesterday };
}

// Old v1 derivation (past days only, minus paid) — used once to seed `owed`
// on migration so a migrated user keeps the exact outstanding they saw.
function legacyDerivedOwed(prayerLog = {}, qaza, today = todayStr()) {
  const owed = zeroCounts();
  if (!qaza?.startDate || qaza.startDate >= today) return owed;
  for (const day of eachDayBetween(qaza.startDate, today)) {
    for (const p of QAZA_PRAYERS) {
      if (!(prayerLog[p] || []).includes(day)) owed[p]++;
    }
  }
  const paid = qaza.paid || {};
  for (const p of QAZA_PRAYERS) owed[p] = Math.max(0, owed[p] - (paid[p] || 0));
  return owed;
}

function migrateV1(old, prayerLog, today) {
  return {
    version: QAZA_VERSION,
    startDate: old.startDate,
    lastSettledDate: addDaysToStr(today, -1), // all past days treated as settled
    owed: legacyDerivedOwed(prayerLog, old, today),
    paidTotal: { ...zeroCounts(), ...(old.paid || {}) },
    paidLog: old.paidLog || {},
    excused: old.excused || [],
  };
}

// Seed-or-migrate-then-settle in one idempotent pass. Run on load once the
// user doc has resolved (an empty prayerLog pre-load would manufacture phantom
// qaza — the caller must gate on the load flag). Returns the same reference
// when a v2 ledger has nothing to settle, so the effect can skip the write.
export function reconcileQaza(qaza, prayerLog = {}, today = todayStr()) {
  if (!qaza || !qaza.startDate) return settleQaza(emptyQaza(), prayerLog, today);
  const q = qaza.version === QAZA_VERSION ? qaza : migrateV1(qaza, prayerLog, today);
  return settleQaza(q, prayerLog, today);
}

// ── mutations (pure reducers) ──────────────────────────────────────────
// pay (−1 owed) and undo (+1 owed) are exact inverses, both scoped to today:
//   • pay is a no-op when nothing is owed  → no phantom "made up" credit
//   • undo is a no-op unless a makeup was logged TODAY → −then+ can't drift
// This is the invariant that kills the counter bug (undoing a prior-day
// makeup then re-adding used to register a phantom "1 made up today").

export function payQaza(qaza, prayer, today = todayStr()) {
  if (!QAZA_PRAYERS.includes(prayer)) return qaza;
  const owed = qazaOwed(qaza);
  if (owed[prayer] <= 0) return qaza; // nothing to make up
  owed[prayer] -= 1;
  const paidTotal = { ...zeroCounts(), ...(qaza.paidTotal || {}) };
  paidTotal[prayer] += 1;
  const paidLog = { ...(qaza.paidLog || {}) };
  const day = { ...(paidLog[today] || {}) };
  day[prayer] = (day[prayer] || 0) + 1;
  paidLog[today] = day;
  return { ...qaza, owed, paidTotal, paidLog };
}

export function undoQaza(qaza, prayer, today = todayStr()) {
  if (!QAZA_PRAYERS.includes(prayer)) return qaza;
  const paidToday = qaza?.paidLog?.[today]?.[prayer] || 0;
  if (paidToday <= 0) return qaza; // can only undo a makeup logged today
  const owed = qazaOwed(qaza);
  owed[prayer] += 1;
  const paidTotal = { ...zeroCounts(), ...(qaza.paidTotal || {}) };
  paidTotal[prayer] = Math.max(0, paidTotal[prayer] - 1);
  const paidLog = { ...(qaza.paidLog || {}) };
  const day = { ...(paidLog[today] || {}) };
  day[prayer] -= 1;
  if (day[prayer] <= 0) delete day[prayer];
  if (Object.keys(day).length) paidLog[today] = day;
  else delete paidLog[today];
  return { ...qaza, owed, paidTotal, paidLog };
}

// Add N to owed[prayer] — manual "record a miss" and the historical-backlog
// entry (Phase B). Clamped at 0 so a negative n can't underflow.
export function addQaza(qaza, prayer, n = 1) {
  if (!QAZA_PRAYERS.includes(prayer) || !Number.isFinite(n) || n === 0) return qaza;
  const base = qaza?.startDate ? qaza : emptyQaza();
  const owed = qazaOwed(base);
  owed[prayer] = Math.max(0, owed[prayer] + n);
  return { ...base, owed };
}

// Keep owed in sync when the user retro-marks/unmarks a fard prayer on a day
// that's already SETTLED (and not excused). Same-day (unsettled) toggles don't
// touch owed — today is still pending. `willBeMarked` is the post-toggle state.
export function qazaAfterRetroToggle(qaza, prayer, day, willBeMarked) {
  if (!QAZA_PRAYERS.includes(prayer)) return qaza;
  if (!qaza?.startDate || !qaza.lastSettledDate) return qaza;
  if (day < qaza.startDate || day > qaza.lastSettledDate) return qaza;
  if (isExcused(day, qaza.excused)) return qaza;
  const owed = qazaOwed(qaza);
  if (willBeMarked) owed[prayer] = Math.max(0, owed[prayer] - 1);
  else owed[prayer] += 1;
  return { ...qaza, owed };
}

// Mark a date range excused and un-count any already-settled, not-previously-
// excused days it now covers (so excusing a period after it settled corrects
// the outstanding count). Phase C UI; pure so it's testable now.
export function addExcusedRange(qaza, from, to, reason = "", prayerLog = {}) {
  if (!qaza?.startDate || !from || !to || from > to) return qaza;
  const owed = qazaOwed(qaza);
  const lo = from < qaza.startDate ? qaza.startDate : from;
  const hi = qaza.lastSettledDate && to > qaza.lastSettledDate ? qaza.lastSettledDate : to;
  if (lo <= hi) {
    for (const day of eachDayBetween(lo, addDaysToStr(hi, 1))) {
      if (isExcused(day, qaza.excused)) continue; // already excused before
      for (const p of QAZA_PRAYERS) {
        if (!(prayerLog[p] || []).includes(day)) owed[p] = Math.max(0, owed[p] - 1);
      }
    }
  }
  return { ...qaza, owed, excused: [...(qaza.excused || []), { from, to, reason }] };
}

// Returns the list of specific missed days for a given prayer (past days,
// startDate→yesterday, not in prayerLog). Independent of the owed counter —
// a raw prayerLog query, kept for the excused-day picker (Phase C).
export function missedDaysForPrayer(prayerLog, qaza, prayer) {
  prayerLog = prayerLog || {};
  if (!qaza?.startDate) return [];
  const today = todayStr();
  if (qaza.startDate >= today) return [];
  const days = eachDayBetween(qaza.startDate, today);
  const log = prayerLog[prayer] || [];
  return days.filter((d) => !log.includes(d));
}
