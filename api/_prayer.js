// Pure helpers for server-side prayer-time computation in notify-prayers.js
// (Phase 2 / K). Underscore-prefixed so Vercel doesn't route this as a
// function. No I/O here — the fetch lives in notify-prayers; these are the
// testable bits.

export const ALADHAN_BASE = "https://api.aladhan.com/v1";
// ISNA method + Hanafi Asr — must match the client (usePrayer) so server-fetched
// times line up with what the user sees in-app.
const METHOD_SCHOOL = "method=2&school=1";

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

// Aladhan request URL for a resolved location + Aladhan-format date. null if
// the location isn't fetchable.
export function aladhanUrl(location, aladhanDate) {
  if (!location || !aladhanDate) return null;
  if (location.kind === "coords") {
    return `${ALADHAN_BASE}/timings/${aladhanDate}?latitude=${encodeURIComponent(location.lat)}&longitude=${encodeURIComponent(location.lng)}&${METHOD_SCHOOL}`;
  }
  if (location.kind === "city") {
    return `${ALADHAN_BASE}/timingsByCity/${aladhanDate}?city=${encodeURIComponent(location.city)}&country=${encodeURIComponent(location.country)}&${METHOD_SCHOOL}`;
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
