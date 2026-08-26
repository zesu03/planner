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

// Raw signed net per prayer (misses − makeups), NOT floored. This is the value
// every mutator reads and writes, so each decrement is exactly reversible by
// its inverse. Previously mutators clamped the STORED counter at 0, which
// destroyed information: a decrement swallowed by the clamp was later "restored"
// by an unclamped inverse as phantom debt (e.g. pay→retro-mark→undo). Storing a
// signed net kills that whole drift class.
export function qazaOwedRaw(qaza) {
  return { ...zeroCounts(), ...(qaza?.owed || {}) };
}

// Outstanding makeups per prayer for DISPLAY — the signed net floored at 0.
// Every consumer of "how many do I owe" (Prayer tab, Stats, the AI report
// payload) routes through here, so a transiently-negative stored net never
// shows as a negative owed.
export function qazaOwed(qaza) {
  const raw = qazaOwedRaw(qaza);
  const out = zeroCounts();
  for (const p of QAZA_PRAYERS) out[p] = Math.max(0, raw[p]);
  return out;
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

// True when prayerLog has no entries for ANY fard prayer. For an established
// user this only happens on a stale/failed load (the log accumulates and is
// never cleared) — settling against it would manufacture phantom qaza.
export function prayerLogIsEmpty(prayerLog) {
  return QAZA_PRAYERS.every((p) => !((prayerLog || {})[p] || []).length);
}

// Does the ledger carry real history (owed / paid / excused / made-up)? An
// established user always does; a brand-new user declaring a backlog does not.
// Pairs with prayerLogIsEmpty to detect the stale-load signature.
export function qazaHasHistory(qaza) {
  if (!qaza) return false;
  const owed = qazaOwedRaw(qaza);
  if (QAZA_PRAYERS.some((p) => owed[p] !== 0)) return true;
  const paidTotal = qaza.paidTotal || {};
  if (QAZA_PRAYERS.some((p) => (paidTotal[p] || 0) > 0)) return true;
  if ((qaza.excused || []).length) return true;
  if (Object.keys(qaza.paidLog || {}).length) return true;
  return false;
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
  // Defense-in-depth against the IRREVERSIBLE over-accrual: an empty prayerLog
  // paired with a ledger that has history is the stale/empty-load signature.
  // Refuse — same reference, and critically DON'T advance lastSettledDate — so
  // the deferred days settle correctly once trustworthy prayerLog data arrives.
  // (The caller's `loaded` gate is the first line of defense; this is the
  // second, in case settle ever runs against a transiently-empty log.) Better
  // to under-count until data is trustworthy than to manufacture permanent debt.
  if (prayerLogIsEmpty(prayerLog) && qazaHasHistory(qaza)) return qaza;
  const owed = qazaOwedRaw(qaza);
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

// Invariant repair: lifetime makeups (paidTotal) can never be less than the
// makeups actually logged per day (paidLog). If a write race ever clobbered
// paidTotal while a paidLog entry survived — the Stats "made up" count reading
// lower than the Prayer tab's "made up today" — raise paidTotal back to the
// logged sum. Never lowers it (pre-paidLog makeups legitimately exceed the log).
// Returns the same reference when already consistent.
function normalizePaidTotal(qaza) {
  const paidLog = qaza.paidLog || {};
  const sums = zeroCounts();
  for (const day of Object.keys(paidLog)) {
    const d = paidLog[day] || {};
    for (const p of QAZA_PRAYERS) sums[p] += d[p] || 0;
  }
  const paidTotal = { ...zeroCounts(), ...(qaza.paidTotal || {}) };
  let changed = false;
  for (const p of QAZA_PRAYERS) {
    if (paidTotal[p] < sums[p]) { paidTotal[p] = sums[p]; changed = true; }
  }
  return changed ? { ...qaza, paidTotal } : qaza;
}

// Does this ledger carry v2-only fields even if `version` is missing/corrupt?
// v1 never wrote `lastSettledDate` or `paidTotal` (it used `paid`), so their
// presence alongside an `owed` map means it's really v2. Guards against a
// partial/corrupted write that dropped `version` being mis-detected as v1 and
// having its `owed` silently recomputed (regressed) from prayerLog.
export function looksLikeV2(qaza) {
  return !!qaza && (qaza.lastSettledDate != null || qaza.paidTotal != null) && qaza.owed != null;
}

// Seed-or-migrate-then-settle-then-heal in one idempotent pass. Run on load
// once the user doc has resolved (an empty prayerLog pre-load would manufacture
// phantom qaza — the caller must gate on the load flag). Returns the same
// reference when there's nothing to change, so the effect can skip the write.
export function reconcileQaza(qaza, prayerLog = {}, today = todayStr()) {
  if (!qaza || !qaza.startDate) return settleQaza(emptyQaza(), prayerLog, today);
  const q = (qaza.version === QAZA_VERSION || looksLikeV2(qaza)) ? qaza : migrateV1(qaza, prayerLog, today);
  return normalizePaidTotal(settleQaza(q, prayerLog, today));
}

// True when settleQaza WOULD refuse to settle because of the empty-prayerLog-
// with-history guard (there ARE days to settle, but the log looks stale). Lets
// the caller emit a monitoring signal for a stuck ledger without importing
// monitoring into this pure module.
export function settleWouldSkip(qaza, prayerLog = {}, today = todayStr()) {
  if (!qaza?.startDate) return false;
  const yesterday = addDaysToStr(today, -1);
  let from = qaza.lastSettledDate ? addDaysToStr(qaza.lastSettledDate, 1) : qaza.startDate;
  if (from < qaza.startDate) from = qaza.startDate;
  if (from > yesterday) return false; // nothing to settle anyway
  return prayerLogIsEmpty(prayerLog) && qazaHasHistory(qaza);
}

// ── mutations (pure reducers) ──────────────────────────────────────────
// pay (−1 owed) and undo (+1 owed) are exact inverses, both scoped to today:
//   • pay is a no-op when nothing is owed  → no phantom "made up" credit
//   • undo is a no-op unless a makeup was logged TODAY → −then+ can't drift
// This is the invariant that kills the counter bug (undoing a prior-day
// makeup then re-adding used to register a phantom "1 made up today").

export function payQaza(qaza, prayer, today = todayStr()) {
  if (!QAZA_PRAYERS.includes(prayer)) return qaza;
  const owed = qazaOwedRaw(qaza);
  if (owed[prayer] <= 0) return qaza; // nothing effectively owed to make up
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
  const owed = qazaOwedRaw(qaza);
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
// entry (Phase B). Operates on the signed net (no stored clamp); display floors
// at 0 via qazaOwed, so a negative n that drives the net below zero shows as 0
// owed but remains exactly reversible.
export function addQaza(qaza, prayer, n = 1) {
  if (!QAZA_PRAYERS.includes(prayer) || !Number.isFinite(n) || n === 0) return qaza;
  const base = qaza?.startDate ? qaza : emptyQaza();
  const owed = qazaOwedRaw(base);
  owed[prayer] = owed[prayer] + n;
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
  const owed = qazaOwedRaw(qaza);
  if (willBeMarked) owed[prayer] -= 1;
  else owed[prayer] += 1;
  return { ...qaza, owed };
}

// Mark a date range excused and un-count any already-settled, not-previously-
// excused days it now covers (so excusing a period after it settled corrects
// the outstanding count). Phase C UI; pure so it's testable now.
export function addExcusedRange(qaza, from, to, reason = "", prayerLog = {}) {
  if (!qaza?.startDate || !from || !to || from > to) return qaza;
  const owed = qazaOwedRaw(qaza);
  const lo = from < qaza.startDate ? qaza.startDate : from;
  const hi = qaza.lastSettledDate && to > qaza.lastSettledDate ? qaza.lastSettledDate : to;
  if (lo <= hi) {
    for (const day of eachDayBetween(lo, addDaysToStr(hi, 1))) {
      if (isExcused(day, qaza.excused)) continue; // already excused before
      for (const p of QAZA_PRAYERS) {
        if (!(prayerLog[p] || []).includes(day)) owed[p] -= 1;
      }
    }
  }
  return { ...qaza, owed, excused: [...(qaza.excused || []), { from, to, reason }] };
}

// Remove the excused range at `index` and re-count any settled days it
// covered that are no longer excused by a remaining range — the inverse of
// addExcusedRange, so undoing a mistaken exemption restores the owed count.
export function removeExcusedRange(qaza, index, prayerLog = {}) {
  const excused = qaza?.excused || [];
  if (index < 0 || index >= excused.length) return qaza;
  const removed = excused[index];
  const remaining = excused.filter((_, i) => i !== index);
  const owed = qazaOwedRaw(qaza);
  if (qaza.startDate && qaza.lastSettledDate) {
    const lo = removed.from < qaza.startDate ? qaza.startDate : removed.from;
    const hi = removed.to > qaza.lastSettledDate ? qaza.lastSettledDate : removed.to;
    if (lo <= hi) {
      for (const day of eachDayBetween(lo, addDaysToStr(hi, 1))) {
        if (isExcused(day, remaining)) continue; // still excused elsewhere
        for (const p of QAZA_PRAYERS) {
          if (!(prayerLog[p] || []).includes(day)) owed[p]++;
        }
      }
    }
  }
  return { ...qaza, owed, excused: remaining };
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
