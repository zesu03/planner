// Pure helpers for server-side prayer-time computation in notify-prayers.js
// (Phase 2 / K). Underscore-prefixed so Vercel doesn't route this as a
// function. No I/O here — the fetch lives in notify-prayers; these are the
// testable bits.

export const ALADHAN_BASE = "https://api.aladhan.com/v1";

// Calculation method + Asr madhab. Kept in lockstep with the client
// (src/lib/prayerConfig — the method-id set + defaults must match) so
// server-fetched times line up with what the user sees in-app. api/ stays
// self-contained (no cross-import from src/), as it did for the old const.
const DEFAULT_METHOD = 2; // ISNA
const DEFAULT_SCHOOL = 1; // Hanafi Asr
const METHOD_IDS = new Set([3, 2, 5, 4, 1, 8, 9, 10, 11, 17, 20, 13, 12, 15, 0]);

// Build `method=<m>&school=<s>` from a (possibly missing/corrupt) user setting,
// falling back to the defaults so we never send a broken query.
export function methodSchoolParam(method, school) {
  // Guard null/"" before coercion: Number(null) === 0, and 0 is a valid method
  // id / Asr school, so a bare coercion would turn "unset" into a real value.
  const mOk = method != null && method !== "" && METHOD_IDS.has(Number(method));
  const m = mOk ? Number(method) : DEFAULT_METHOD;
  const sOk = school != null && school !== "" && (Number(school) === 0 || Number(school) === 1);
  const s = sOk ? Number(school) : DEFAULT_SCHOOL;
  return `method=${m}&school=${s}`;
}

export const DEFAULT_METHOD_SCHOOL = methodSchoolParam(DEFAULT_METHOD, DEFAULT_SCHOOL); // "method=2&school=1"

// "YYYY-MM-DD" -> "DD-MM-YYYY" (Aladhan's path date format). null if malformed.
export function toAladhanDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Aladhan sometimes appends " (TZ)" to a time (e.g. "05:23 (PKT)") — strip to
// bare HH:MM so the minute comparison in notify-prayers parses cleanly.
export function bareTime(t) {
  return typeof t === "string" ? t.replace(/\s*\(.+?\)\s*$/, "").trim() : t;
}

// Where to fetch a user's times: prefer stored coordinates, then city/country.
// `key` dedupes fetches across users at the same location within one tick.
export function resolveLocation(settings) {
  const s = settings || {};
  if (s.prayerLat != null && s.prayerLng != null) {
    return { kind: "coords", lat: s.prayerLat, lng: s.prayerLng, key: `c:${s.prayerLat},${s.prayerLng}` };
  }
  if (s.prayerCity && s.prayerCountry) {
    return { kind: "city", city: s.prayerCity, country: s.prayerCountry, key: `t:${s.prayerCity}|${s.prayerCountry}` };
  }
  return { kind: "none", key: null };
}

// Aladhan request URL for a resolved location + Aladhan-format date. `methodSchool`
// is the `method=…&school=…` fragment (from the user's settings via
// methodSchoolParam); defaults to ISNA/Hanafi. null if the location isn't fetchable.
export function aladhanUrl(location, aladhanDate, methodSchool = DEFAULT_METHOD_SCHOOL) {
  if (!location || !aladhanDate) return null;
  if (location.kind === "coords") {
    return `${ALADHAN_BASE}/timings/${aladhanDate}?latitude=${encodeURIComponent(location.lat)}&longitude=${encodeURIComponent(location.lng)}&${methodSchool}`;
  }
  if (location.kind === "city") {
    return `${ALADHAN_BASE}/timingsByCity/${aladhanDate}?city=${encodeURIComponent(location.city)}&country=${encodeURIComponent(location.country)}&${methodSchool}`;
  }
  return null;
}

// Extract the five fard times (bare HH:MM) from an Aladhan `timings` object.
export function extractTimes(timings) {
  const t = timings || {};
  const out = {};
  for (const p of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) out[p] = bareTime(t[p]);
  return out;
}

// Is `ymd` ("YYYY-MM-DD") a Friday? UTC-based so it's tz-independent (a calendar
// date's weekday is the same everywhere).
export function isFridayYMD(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
  if (!m) return false;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() === 5;
}

// Display name for a prayer on a given date — Friday's Dhuhr shows as Jumu'ah.
export function prayerDisplayName(prayer, ymd) {
  return prayer === "Dhuhr" && isFridayYMD(ymd) ? "Jumu'ah" : prayer;
}
