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

// Friday's Dhuhr is prayed as Jumu'ah. DISPLAY-ONLY: prayerLog storage stays
// under "Dhuhr" (streaks / history / qaza unaffected); we only relabel it in
// today-specific UI and the Friday push. Icon/colour lookups keep using the
// real "Dhuhr" key — only the visible text changes.
export function isFriday(dayStr) {
  if (!dayStr) return false;
  const [y, m, d] = String(dayStr).split("-").map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d).getDay() === 5; // local weekday; 5 = Friday
}

export function prayerDisplayName(prayer, dayStr) {
  return prayer === "Dhuhr" && isFriday(dayStr) ? "Jumu'ah" : prayer;
}

// The five obligatory prayers the reminder mirror tracks.
const MIRROR_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

// Is the already-stored reminder mirror (`existing`) good enough that a client
// should NOT overwrite it with its freshly-computed `times` for `today`?
//
// The mirror (notifications.prayerTimes) exists so the server cron has
// authoritative prayer times to match against. When two app instances are open
// at once (installed PWA + a browser tab, or two tabs), their Aladhan fetches
// can disagree by a single minute — city-vs-coords endpoint, or a request whose
// timestamp straddles a rounding boundary. A STRICT equality check then makes
// each instance treat the other's value as "changed" and rewrite its own on
// every snapshot: an infinite write ping-pong that pulses "Saving…" while the
// app sits idle and quietly burns Firestore quota 24/7.
//
// The fix: treat a sub-`tolMin`-minute disagreement as already-fresh so the
// clients stop fighting (whichever wrote first for the day wins; ±1 min is
// immaterial — the server already matches reminders within a ±1-min window).
// A REAL change still updates: a new day fails the date check, and a city
// change shifts times by far more than the tolerance. Once ANY open instance
// runs this tolerant check it stops re-writing, which starves the loop even if
// another instance is still on the old strict code.
//
// Pure + tolerant-by-value so it's unit-testable without React.
export function prayerTimesMirrorFresh(existing, today, times, tolMin = 1) {
  if (!existing || existing.date !== today || !existing.times) return false;
  return MIRROR_PRAYERS.every((p) => {
    const a = parseHHMM(existing.times[p]);
    const b = parseHHMM(times?.[p]);
    // If either side isn't a parseable HH:MM, fall back to strict equality so a
    // genuinely missing/garbled time still triggers a corrective write.
    if (a == null || b == null) return existing.times[p] === times?.[p];
    return Math.abs(a - b) <= tolMin;
  });
}

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

// "Next thing to pray" with window awareness.
//   - If a prayer's window is open and it isn't logged done → due now
//   - Otherwise → next upcoming start time today
//   - After Isha start → tomorrow's Fajr
// Returns { name, time, due?, tomorrow? } or null.
//
// `prevDay` (yesterday's YYYY-MM-DD) is passed in so the done-check for a
// night-crossing prayer matches prayerDayFor's attribution: Isha marked
// between local midnight and Fajr lands on YESTERDAY, so the "due" card must
// read yesterday too — otherwise it stays "Mark prayed" after the user has
// already marked last night's Isha, and each tap just re-toggles the mark.
export function nextPrayer(prayerTimes, prayerLog, today, now = new Date(), prevDay = null) {
  if (!prayerTimes) return null;
  const five = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].filter((p) => prayerTimes[p]);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const active = currentPrayerWindow(prayerTimes, now);
  if (active) {
    const fajr = parseHHMM(prayerTimes.Fajr);
    const activeDay = active === "Isha" && fajr != null && nowMins < fajr && prevDay
      ? prevDay
      : today;
    if (!(prayerLog?.[active] || []).includes(activeDay)) {
      return { name: active, time: prayerTimes[active], due: true };
    }
  }

  for (const p of five) {
    const mins = parseHHMM(prayerTimes[p]);
    if (mins != null && mins > nowMins) {
      return { name: p, time: prayerTimes[p] };
    }
  }
  return { name: "Fajr", time: prayerTimes.Fajr, tomorrow: true };
}

// Read a "mark this prayer" instruction from a URL query string. The push
// notification's "Mark prayed" action opens the app at /?markPrayer=<Prayer>;
// Planner consumes this once on boot. Returns the prayer name only if present
// AND in `valid` (the five fard — never Sunrise), else null.
export function parsePrayerMarkParam(search, valid = []) {
  try {
    const p = new URLSearchParams(search || "").get("markPrayer");
    return p && valid.includes(p) ? p : null;
  } catch {
    return null;
  }
}
