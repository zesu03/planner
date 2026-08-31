// Jamā'ah (congregation) times + the prayer-aware focus-timer nudge.
//
// Aladhan gives each prayer's START time (when the window opens). Many people
// pray in congregation at the mosque, which is a LATER fixed time the mosque
// sets (Fajr starts 05:00 but jamā'ah is 05:30). The user can optionally store
// their mosque's jamā'ah time per prayer in settings.jamaahTimes; where set, it
// overrides the start time as the "prayer is happening" moment the focus timer
// counts down to. Purely additive — nothing here affects prayer-marking or the
// window gating (you can still pray any time after the start).

export const FARD = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

// How close (minutes) to the effective prayer time a running focus session
// triggers the "wrap up" nudge.
export const NUDGE_THRESHOLD_MINS = 10;

// Validate a jamā'ah time input → zero-padded "HH:MM", or null if empty/invalid.
export function normalizeJamaahTime(v) {
  if (v == null) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Strip a trailing " (TZ)" that Aladhan sometimes appends, to a bare "HH:MM".
function bare(t) {
  return typeof t === "string" ? t.replace(/\s*\(.+?\)\s*$/, "").trim() : t;
}

// Minutes since local midnight for "HH:MM", or null if unparseable.
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

// The clock time to treat as "prayer happening" for `prayer`: the user's
// jamā'ah time if set + valid, else the Aladhan start time. "HH:MM" or null.
export function effectivePrayerTime(prayer, prayerTimes, jamaahTimes) {
  const j = normalizeJamaahTime(jamaahTimes?.[prayer]);
  if (j) return j;
  const start = bare(prayerTimes?.[prayer]);
  return toMinutes(start) == null ? null : start;
}

// The next fard prayer today whose EFFECTIVE time is still ahead of `now` and
// hasn't been prayed yet. Returns { name, time, minsUntil, isJamaah } or null
// when nothing is left today. The caller decides whether minsUntil is within
// the nudge threshold — keeping this pure and easy to test.
export function nextPrayerNudge({ prayerTimes, jamaahTimes, now = new Date(), isDone = () => false }) {
  if (!prayerTimes) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const p of FARD) {
    if (isDone(p)) continue;
    const time = effectivePrayerTime(p, prayerTimes, jamaahTimes);
    const mins = toMinutes(time);
    if (mins == null || mins < nowMins) continue;
    if (!best || mins < best.mins) {
      best = { name: p, time, mins, isJamaah: !!normalizeJamaahTime(jamaahTimes?.[p]) };
    }
  }
  if (!best) return null;
  return { name: best.name, time: best.time, minsUntil: best.mins - nowMins, isJamaah: best.isJamaah };
}
