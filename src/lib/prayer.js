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
