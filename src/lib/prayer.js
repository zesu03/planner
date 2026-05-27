// Prayer-window helpers — pure functions, no React.
//
// A prayer's window is the span during which praying it counts as "on time":
//   Fajr     → Sunrise          (the only window that ends at a non-prayer event)
//   Dhuhr    → Asr
//   Asr      → Maghrib
//   Maghrib  → Isha
//   Isha     → next-day Fajr    (extends through the night)
//
// Between Sunrise and Dhuhr there is no active window — Fajr is over,
// Dhuhr hasn't begun. `currentPrayerWindow` returns null in that gap.
//
// ── Day-attribution rule ───────────────────────────────────────────────
// Isha and Tahajjud windows cross midnight. If the user marks them
// between local midnight and today's Fajr, the act belongs to YESTERDAY's
// prayer window — the user prayed "last night's" Isha, not "tomorrow
// night's." `prayerDayFor` encodes that rule and is the single source of
// truth for "which day does this prayer-mark belong to."
//
// Aggregations that bucket days (Stats heatmaps, weekly digests, the
// 7-day grid in Prayer view) all use the wall-clock day — they read
// what's actually stored. If Isha for Sunday was marked at 2am Monday,
// prayerDayFor attributed it to Sunday, and the Sunday cell shows the
// tick. No double-bucketing.

const parseHHMM = (s) => {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

// The currently-active prayer window, or null if the user is between windows.
// `prayerTimes` is the Aladhan timings object (HH:MM strings).
export function currentPrayerWindow(prayerTimes, now = new Date()) {
  if (!prayerTimes) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const fajr = parseHHMM(prayerTimes.Fajr);
  const sunrise = parseHHMM(prayerTimes.Sunrise);
  const dhuhr = parseHHMM(prayerTimes.Dhuhr);
  const asr = parseHHMM(prayerTimes.Asr);
  const maghrib = parseHHMM(prayerTimes.Maghrib);
  const isha = parseHHMM(prayerTimes.Isha);

  // Before Fajr — Isha from the previous day is still in effect.
  if (fajr != null && nowMins < fajr) return "Isha";

  const windows = [
    { name: "Fajr", start: fajr, end: sunrise },
    { name: "Dhuhr", start: dhuhr, end: asr },
    { name: "Asr", start: asr, end: maghrib },
    { name: "Maghrib", start: maghrib, end: isha },
    // Isha extends past midnight — cap at end of day for today's view.
    { name: "Isha", start: isha, end: 24 * 60 },
  ];
  for (const w of windows) {
    if (w.start == null || w.end == null) continue;
    if (nowMins >= w.start && nowMins < w.end) return w.name;
  }
  return null;
}

// Which calendar day does a "Mark prayed" tap for `prayer` belong to?
// For day-prayers (Fajr/Dhuhr/Asr/Maghrib) the answer is always today —
// their windows fit inside one solar day. For night-crossing prayers
// (Isha, Tahajjud), a tap between local midnight and today's Fajr is
// attributed to YESTERDAY's window.
//
// Inputs are simple values so this stays pure and testable:
//   - prayer: prayer name (string)
//   - prayerTimes: Aladhan timings object (or null/undefined — falls back
//     to a safe 4:30 AM Fajr estimate)
//   - todayStrFn: callable that returns today's YYYY-MM-DD (the lib/dates
//     export; passed in to avoid lib/prayer depending on lib/dates)
//   - addDaysToStrFn: callable to step a date string by N days (also from
//     lib/dates, passed in for the same reason)
//   - now: optional Date for tests (defaults to now)
export function prayerDayFor(prayer, prayerTimes, todayStrFn, addDaysToStrFn, now = new Date()) {
  if (prayer !== "Isha" && prayer !== "Tahajjud") return todayStrFn();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const fajrMins = (() => {
    const s = prayerTimes?.Fajr;
    if (!s) return 4 * 60 + 30;
    const [h, m] = s.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 4 * 60 + 30;
  })();
  if (nowMins >= fajrMins) return todayStrFn();
  return addDaysToStrFn(todayStrFn(), -1);
}

// Today's prayers whose window has already closed and haven't been logged.
// "Closed" means the next-prayer-start (or Sunrise for Fajr) has passed.
// Isha is excluded — its window doesn't close before midnight, so it can
// only become a "missed today" once the day rolls over.
export function prayersClosedUnpaid(prayerTimes, prayerLog, today, now = new Date()) {
  if (!prayerTimes) return [];
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const ended = [
    { p: "Fajr", endKey: "Sunrise" },
    { p: "Dhuhr", endKey: "Asr" },
    { p: "Asr", endKey: "Maghrib" },
    { p: "Maghrib", endKey: "Isha" },
  ];
  const out = [];
  for (const { p, endKey } of ended) {
    const end = parseHHMM(prayerTimes[endKey]);
    if (end == null) continue;
    if (nowMins >= end && !(prayerLog?.[p] || []).includes(today)) out.push(p);
  }
  return out;
}

// "Next thing to pray" with window awareness.
//   - If a prayer's window is open and it isn't logged done → due now
//   - Otherwise → next upcoming start time today
//   - After Isha start → tomorrow's Fajr
// Returns { name, time, due?, tomorrow? } or null.
export function nextPrayer(prayerTimes, prayerLog, today, now = new Date()) {
  if (!prayerTimes) return null;
  const five = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].filter((p) => prayerTimes[p]);
  const isDone = (p) => (prayerLog?.[p] || []).includes(today);

  const active = currentPrayerWindow(prayerTimes, now);
  if (active && !isDone(active)) {
    return { name: active, time: prayerTimes[active], due: true };
  }

  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const p of five) {
    const mins = parseHHMM(prayerTimes[p]);
    if (mins != null && mins > nowMins) {
      return { name: p, time: prayerTimes[p] };
    }
  }
  return { name: "Fajr", time: prayerTimes.Fajr, tomorrow: true };
}
