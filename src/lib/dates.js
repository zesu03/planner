// Date helpers. Stored values are always YYYY-MM-DD strings (Firestore-friendly).
//
// All "today" / "the day this happened" calculations use the user's DEVICE
// LOCAL timezone (whatever Intl resolves on this machine right now). This
// means:
//   - the day rolls over at the user's local midnight, not UTC midnight
//   - if the user travels across timezones, "today" follows their device
//   - the user's location vs timezone are different concerns: prayer times
//     are location-based (lat/long) and update via the prayer-city setting;
//     calendar dates are timezone-based and follow the device.

// The IANA timezone the device reports right now. Resolved once at module
// load — if the user changes their device's timezone while the page is
// open, they'll need to refresh to pick it up. That's fine: the page is
// almost always reloaded after a flight or system change.
export const TIMEZONE = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
})();

// en-CA naturally formats as YYYY-MM-DD, which is exactly what we store.
const _ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const localDateStr = (d = new Date()) => _ymdFormatter.format(d);

export const todayStr = () => localDateStr();

// Days from today to `due`, computed via local-midnight math so DST and
// timezone offsets don't introduce off-by-one drift. Negative = overdue.
export const daysLeft = (due) => {
  // Take the local "today" and "due" date strings, subtract them as UTC
  // midnights — both anchored the same way, so the difference is exact.
  const a = new Date(`${todayStr()}T00:00:00Z`);
  const b = new Date(`${due}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
};

export const fmt = (d) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// Return today's local date plus N days as YYYY-MM-DD.
export const addDays = (n) => {
  // Anchor at UTC midnight of today (so setDate moves whole calendar days
  // unambiguously), then re-format in local timezone.
  const d = new Date(`${todayStr()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return localDateStr(d);
};

// Iterate YYYY-MM-DD strings from startStr (inclusive) up to endStr (exclusive).
// Operates purely on date strings — noon-UTC anchored to dodge DST drift —
// so iteration matches the keys stored in prayerLog / muhasaba regardless of
// the user's timezone.
export const eachDayBetween = (startStr, endStr) => {
  const out = [];
  let cur = startStr;
  while (cur < endStr) {
    out.push(cur);
    const d = new Date(`${cur}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    cur = `${y}-${m}-${day}`;
  }
  return out;
};

export const endOfYear = () => `${todayStr().slice(0, 4)}-12-31`;
