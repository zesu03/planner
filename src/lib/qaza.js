// Qaza ledger — per-prayer count of missed-prayer makeups still owed.
//
// Owed is DERIVED from prayerLog, not stored. For each day from `startDate`
// (inclusive) to yesterday (inclusive), if a prayer isn't in prayerLog[p]
// that's one qaza owed for p. Today is also counted, but only for prayers
// whose window has already closed (Fajr after Sunrise, etc.) — see
// prayersClosedUnpaid in ./prayer. `paid[p]` is incremented by the user
// when they make one up — there's no way to know which specific missed-day
// the makeup pays off, so we keep it as a count and decrement owed by paid.
//
// Sunrise is not a prayer — never included.

import { todayStr, localDateStr, eachDayBetween } from "./dates";
import { prayersClosedUnpaid } from "./prayer";

export const QAZA_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

export const emptyQaza = () => ({
  startDate: todayStr(),
  paid: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 },
});

// Returns { Fajr: n, Dhuhr: n, ... } — qaza still owed per prayer, never
// negative. Past days (startDate to yesterday) are always counted; today's
// prayers are counted only once their window has closed (e.g. Fajr counts
// after Sunrise). `prayerTimes` is optional — without it, today is skipped
// entirely (the pre-window-awareness behaviour).
export function computeQazaOwed(prayerLog, qaza, prayerTimes = null, now = new Date()) {
  const owed = { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 };
  if (!qaza?.startDate) return owed;
  const today = todayStr();
  if (qaza.startDate < today) {
    const days = eachDayBetween(qaza.startDate, today);
    for (const day of days) {
      for (const p of QAZA_PRAYERS) {
        if (!(prayerLog[p] || []).includes(day)) owed[p]++;
      }
    }
  }
  if (prayerTimes) {
    for (const p of prayersClosedUnpaid(prayerTimes, prayerLog, today, now)) {
      owed[p]++;
    }
  }
  const paid = qaza.paid || {};
  for (const p of QAZA_PRAYERS) {
    owed[p] = Math.max(0, owed[p] - (paid[p] || 0));
  }
  return owed;
}

// Returns the list of specific missed days for a given prayer, so the UI
// can show "you missed Fajr on May 12, May 15…". Not adjusted by paid (paid
// is just a count — we can't tell *which* day was made up).
export function missedDaysForPrayer(prayerLog, qaza, prayer) {
  if (!qaza?.startDate) return [];
  const today = todayStr();
  if (qaza.startDate >= today) return [];
  const days = eachDayBetween(qaza.startDate, today);
  const log = prayerLog[prayer] || [];
  return days.filter((d) => !log.includes(d));
}
