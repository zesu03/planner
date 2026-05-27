// Prayer-times hook. Owns prayerTimes, prayerCity, the form inputs the user
// types into ("city" / "country"), loading & error flags, and the Hijri date
// string that comes back from Aladhan. Persists the chosen city to user
// settings so a returning session auto-fetches without a prompt.
//
// All Aladhan calls pass method=2 (ISNA) + school=1 (Hanafi Asr — later
// shadow). Three entry points:
//   - fetchPrayersFromSettings: silent restore on first load
//   - fetchPrayers(city, country): user-initiated by city input
//   - fetchByGeo: user-initiated, uses navigator.geolocation
//
// The settings-restore guard fires once per page load via a ref; it doesn't
// react to subsequent settings re-emits from the debounced Firestore save.

import { useCallback, useEffect, useRef, useState } from "react";
import { localDateStr } from "../lib/dates";

const ALADHAN_BASE = "https://api.aladhan.com/v1";
const METHOD_SCHOOL = "method=2&school=1";

// OpenStreetMap Nominatim reverse-geocoding endpoint. Free, no API key,
// rate-limited to ~1 req/sec per their usage policy — fine for our scale
// (one call per "Use my location" tap). Browser fetch can't set a custom
// User-Agent, so attribution goes via the Referer header that the browser
// attaches automatically. See https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse";

// Resolve lat/lng → { city, country } via Nominatim. Returns null on any
// failure (network, timeout, no city in the response) so the caller can
// fall back to its existing timezone-derived label. Picks the first
// available admin level from city → town → village → suburb, since
// Nominatim only fills the one that matches the coordinate's specificity.
async function reverseGeocode(lat, lng) {
  try {
    // zoom=10 trims response to roughly "city" level; jsonv2 returns a
    // structured `address` object instead of a flat string.
    const url = `${NOMINATIM_BASE}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&accept-language=en`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.suburb || a.county || null;
    const country = a.country || null;
    if (!city) return null;
    return { city, country };
  } catch {
    return null;
  }
}

// Aladhan sometimes appends " (TZ)" to time strings (e.g. "05:23 (PKT)").
// The cron endpoint compares against bare HH:MM, so strip the suffix on
// the client before persisting.
function bareTime(t) {
  return typeof t === "string" ? t.replace(/\s*\(.+?\)\s*$/, "").trim() : t;
}

export function usePrayer({ settingsFromDb, userSettings, updateSettings, notifications, updateNotifications }) {
  const [prayerTimes, setPrayerTimes] = useState(null);
  const [prayerCity, setPrayerCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [prayerLoading, setPrayerLoading] = useState(false);
  const [prayerError, setPrayerError] = useState("");
  const [hijriDate, setHijriDate] = useState("");
  const settingsAppliedRef = useRef(false);

  // Silent restore. Used by the settings-restore effect; doesn't surface
  // network errors because the user didn't ask for this fetch.
  const fetchPrayersFromSettings = useCallback(async (city, country) => {
    try {
      const ts = Math.floor(Date.now() / 1000);
      const res = await fetch(`${ALADHAN_BASE}/timingsByCity/${ts}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&${METHOD_SCHOOL}`);
      const data = await res.json();
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
        setPrayerCity(`${city}, ${country}`);
        const h = data.data.date.hijri;
        setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
      }
    } catch { /* silent — restore is best-effort */ }
  }, []);

  // User-initiated city fetch. Persists the choice on success so it
  // restores next session. Clears any stored lat/lng so the next restore
  // uses the city/country path rather than stale coordinates.
  const fetchPrayers = useCallback(async (city, country) => {
    const safeCity = city.trim();
    const safeCountry = country.trim();
    if (!safeCity || !safeCountry) return;
    setPrayerLoading(true); setPrayerError("");
    try {
      const ts = Math.floor(Date.now() / 1000);
      const res = await fetch(`${ALADHAN_BASE}/timingsByCity/${ts}?city=${encodeURIComponent(safeCity)}&country=${encodeURIComponent(safeCountry)}&${METHOD_SCHOOL}`);
      const data = await res.json();
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
        setPrayerCity(`${safeCity}, ${safeCountry}`);
        const h = data.data.date.hijri;
        setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
        updateSettings({
          ...userSettings,
          prayerCity: safeCity,
          prayerCountry: safeCountry,
          prayerLat: null,
          prayerLng: null,
        });
      } else {
        setPrayerError("City not found. Try again.");
      }
    } catch {
      setPrayerError("Could not fetch. Check connection.");
    }
    setPrayerLoading(false);
  }, [userSettings, updateSettings]);

  // Coordinate-based fetch. Two callers:
  //   • fetchByGeo (user-initiated) — persists lat/lng so reload restores.
  //   • restore effect (silent) — uses stored lat/lng, doesn't re-persist.
  //
  // Two HTTP calls run in parallel:
  //   • Aladhan /timings — prayer times for the coordinate.
  //   • Nominatim /reverse — real city name (Pune, not "Kolkata").
  //
  // If Nominatim succeeds, the label is e.g. "Pune, India". If it fails
  // or returns no city, we fall back to the Aladhan timezone-derived
  // label ("Kolkata · your location") so the user still sees something
  // meaningful. prayerCity/prayerCountry in settings are NOT touched on
  // the geo path — they hold the user's last *typed* values for form
  // restore. The active-location signal remains the presence of
  // prayerLat/prayerLng.
  const fetchByCoords = useCallback(async (lat, lng, { silent = false, persist = true } = {}) => {
    if (!silent) { setPrayerLoading(true); setPrayerError(""); }
    try {
      const ts = Math.floor(Date.now() / 1000);
      const [prayerRes, geo] = await Promise.all([
        fetch(`${ALADHAN_BASE}/timings/${ts}?latitude=${lat}&longitude=${lng}&${METHOD_SCHOOL}`),
        reverseGeocode(lat, lng),
      ]);
      const data = await prayerRes.json();
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
        let label;
        if (geo?.city) {
          label = geo.country ? `${geo.city}, ${geo.country}` : geo.city;
        } else {
          const tz = data.data.meta?.timezone || "";
          // "Asia/Karachi" → "Karachi"; underscores ("New_York") become spaces.
          const tzCity = tz.split("/").pop().replace(/_/g, " ").trim();
          label = tzCity ? `${tzCity} · your location` : "Your location";
        }
        setPrayerCity(label);
        const h = data.data.date.hijri;
        setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
        if (persist) {
          updateSettings({
            ...userSettings,
            prayerLat: lat,
            prayerLng: lng,
          });
        }
      } else if (!silent) {
        setPrayerError("Could not get times for your location.");
      }
    } catch {
      if (!silent) setPrayerError("Failed to fetch.");
    }
    if (!silent) setPrayerLoading(false);
  }, [userSettings, updateSettings]);

  // Geolocation prompt + fetch. Thin wrapper around fetchByCoords that
  // gathers the position from the browser.
  const fetchByGeo = useCallback(() => {
    if (!navigator.geolocation) { setPrayerError("Geolocation not supported."); return; }
    setPrayerLoading(true); setPrayerError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchByCoords(pos.coords.latitude, pos.coords.longitude),
      () => { setPrayerError("Location permission denied."); setPrayerLoading(false); }
    );
  }, [fetchByCoords]);

  // One-shot restore from persisted settings. `settingsFromDb` is the raw
  // object from useUserData (may be null on first render). Three guards:
  //   • settingsAppliedRef — protects against re-fire while the first
  //     restore fetch is still in flight (settingsFromDb can re-emit).
  //   • prayerTimes — if a location is already loaded (user just
  //     interactively set it), the restore would be a redundant network
  //     call. fetchByCoords's useCallback rebuilds on every userSettings
  //     change, which puts this effect in a re-run loop without this guard.
  //   • settingsFromDb null — initial render before Firestore returned.
  //
  // Geo path wins if both lat/lng AND city/country are present, but the
  // city/country values still pre-populate the form inputs so a later
  // "Change city" tap shows the user's last typed values rather than
  // empty fields.
  useEffect(() => {
    if (settingsAppliedRef.current || prayerTimes || !settingsFromDb) return;
    if (settingsFromDb.prayerCity) setCityInput(settingsFromDb.prayerCity);
    if (settingsFromDb.prayerCountry) setCountryInput(settingsFromDb.prayerCountry);
    if (settingsFromDb.prayerLat != null && settingsFromDb.prayerLng != null) {
      settingsAppliedRef.current = true;
      fetchByCoords(settingsFromDb.prayerLat, settingsFromDb.prayerLng, { silent: true, persist: false });
    } else if (settingsFromDb.prayerCity && settingsFromDb.prayerCountry) {
      settingsAppliedRef.current = true;
      fetchPrayersFromSettings(settingsFromDb.prayerCity, settingsFromDb.prayerCountry);
    }
  }, [settingsFromDb, fetchPrayersFromSettings, fetchByCoords, prayerTimes]);

  // Mirror today's prayer times to the notifications field so the server
  // cron (which can't call Aladhan per-tick) has authoritative times to
  // match against. Cheap guard: skip writes when the cached payload is
  // already today's and the five values match — without it, every snapshot
  // re-emit from Firestore would re-trigger this effect and burn writes.
  // We only mirror when the user has opted in (notifications.prayer.enabled);
  // no point bloating the doc for users who'll never see a push.
  useEffect(() => {
    if (!prayerTimes || !updateNotifications) return;
    if (!notifications?.prayer?.enabled) return;
    const today = localDateStr();
    const times = {
      Fajr: bareTime(prayerTimes.Fajr),
      Dhuhr: bareTime(prayerTimes.Dhuhr),
      Asr: bareTime(prayerTimes.Asr),
      Maghrib: bareTime(prayerTimes.Maghrib),
      Isha: bareTime(prayerTimes.Isha),
    };
    const existing = notifications?.prayerTimes;
    const unchanged = existing?.date === today
      && existing?.times?.Fajr === times.Fajr
      && existing?.times?.Dhuhr === times.Dhuhr
      && existing?.times?.Asr === times.Asr
      && existing?.times?.Maghrib === times.Maghrib
      && existing?.times?.Isha === times.Isha;
    if (unchanged) return;
    updateNotifications({ ...notifications, prayerTimes: { date: today, times } });
  }, [prayerTimes, notifications, updateNotifications]);

  return {
    prayerTimes,
    prayerCity,
    cityInput,
    countryInput,
    prayerLoading,
    prayerError,
    hijriDate,
    setPrayerTimes,
    setCityInput,
    setCountryInput,
    fetchPrayers,
    fetchByGeo,
  };
}
