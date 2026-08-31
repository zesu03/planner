// Prayer-times hook. Owns prayerTimes, prayerCity, the form inputs the user
// types into ("city" / "country"), loading & error flags, and the Hijri date
// string that comes back from Aladhan. Persists the chosen city to user
// settings so a returning session auto-fetches without a prompt.
//
// Aladhan calls pass the user's chosen calculation method + Asr madhab
// (settings.prayerMethod / settings.prayerSchool, defaulting to ISNA + Hanafi
// Asr — see lib/prayerConfig). Three entry points:
//   - fetchPrayersFromSettings: silent restore on first load
//   - fetchPrayers(city, country): user-initiated by city input
//   - fetchByGeo: user-initiated, uses navigator.geolocation
//
// The settings-restore guard fires once per page load via a ref; it doesn't
// react to subsequent settings re-emits from the debounced Firestore save.

import { useCallback, useEffect, useRef, useState } from "react";
import { localDateStr } from "../lib/dates";
import { prayerTimesMirrorFresh } from "../lib/prayer";
import { methodSchoolParam, normalizeMethod, normalizeSchool, DEFAULT_METHOD, DEFAULT_SCHOOL } from "../lib/prayerConfig";

const ALADHAN_BASE = "https://api.aladhan.com/v1";

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
  // Monotonic token so a slower earlier fetch (e.g. a city lookup the user
  // then abandons by tapping "use my location") can't overwrite the newer
  // result. Each fetch path bumps it and ignores its own response if stale.
  const fetchSeqRef = useRef(0);

  // Calculation method + Asr madhab, read from settings. Kept in a ref so the
  // fetch callbacks read the freshest values at call time WITHOUT rebuilding
  // (and re-triggering the restore effect) on every settings re-emit, and so
  // setPrayerCalc's re-fetch uses the new value synchronously — no wait for the
  // debounced settings write to round-trip.
  const prayerMethod = normalizeMethod(userSettings?.prayerMethod ?? DEFAULT_METHOD);
  const prayerSchool = normalizeSchool(userSettings?.prayerSchool ?? DEFAULT_SCHOOL);
  const calcRef = useRef({ method: prayerMethod, school: prayerSchool });
  useEffect(() => { calcRef.current = { method: prayerMethod, school: prayerSchool }; }, [prayerMethod, prayerSchool]);
  const calcParam = () => methodSchoolParam(calcRef.current.method, calcRef.current.school);

  // Last successfully-fetched location, so changing the method/madhab can
  // re-fetch the SAME place (city vs coords) rather than guessing.
  const lastLocRef = useRef(null);

  // Silent restore. Used by the settings-restore effect; doesn't surface
  // network errors because the user didn't ask for this fetch.
  const fetchPrayersFromSettings = useCallback(async (city, country) => {
    const mySeq = ++fetchSeqRef.current;
    try {
      const ts = Math.floor(Date.now() / 1000);
      const res = await fetch(`${ALADHAN_BASE}/timingsByCity/${ts}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&${calcParam()}`);
      const data = await res.json();
      if (mySeq !== fetchSeqRef.current) return;   // superseded by a newer fetch
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
        setPrayerCity(`${city}, ${country}`);
        lastLocRef.current = { kind: "city", city, country };
        const h = data.data?.date?.hijri;
        if (h) setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
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
    const mySeq = ++fetchSeqRef.current;
    setPrayerLoading(true); setPrayerError("");
    try {
      const ts = Math.floor(Date.now() / 1000);
      const res = await fetch(`${ALADHAN_BASE}/timingsByCity/${ts}?city=${encodeURIComponent(safeCity)}&country=${encodeURIComponent(safeCountry)}&${calcParam()}`);
      const data = await res.json();
      if (mySeq !== fetchSeqRef.current) return;   // superseded by a newer fetch
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
        setPrayerCity(`${safeCity}, ${safeCountry}`);
        lastLocRef.current = { kind: "city", city: safeCity, country: safeCountry };
        const h = data.data?.date?.hijri;
        if (h) setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
        updateSettings((prev) => ({
          ...prev,
          prayerCity: safeCity,
          prayerCountry: safeCountry,
          prayerLat: null,
          prayerLng: null,
        }));
      } else {
        setPrayerError("City not found. Try again.");
      }
    } catch {
      if (mySeq !== fetchSeqRef.current) return;
      setPrayerError("Could not fetch. Check connection.");
    }
    if (mySeq === fetchSeqRef.current) setPrayerLoading(false);
  }, [updateSettings]);

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
    const mySeq = ++fetchSeqRef.current;
    if (!silent) { setPrayerLoading(true); setPrayerError(""); }
    try {
      const ts = Math.floor(Date.now() / 1000);
      const [prayerRes, geo] = await Promise.all([
        fetch(`${ALADHAN_BASE}/timings/${ts}?latitude=${lat}&longitude=${lng}&${calcParam()}`),
        reverseGeocode(lat, lng),
      ]);
      const data = await prayerRes.json();
      if (mySeq !== fetchSeqRef.current) return;   // superseded by a newer fetch
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
        lastLocRef.current = { kind: "coords", lat, lng };
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
        const h = data.data?.date?.hijri;
        if (h) setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
        if (persist) {
          updateSettings((prev) => ({ ...prev, prayerLat: lat, prayerLng: lng }));
        }
      } else if (!silent) {
        setPrayerError("Could not get times for your location.");
      }
    } catch {
      if (mySeq !== fetchSeqRef.current) return;
      if (!silent) setPrayerError("Failed to fetch.");
    }
    if (!silent && mySeq === fetchSeqRef.current) setPrayerLoading(false);
  }, [updateSettings]);

  // Geolocation prompt + fetch. Thin wrapper around fetchByCoords that
  // gathers the position from the browser. Returns a promise that resolves
  // once the full chain (permission → coords → Aladhan → state set) is
  // done, so callers can drive a "Asking…" state through the whole flow.
  // Rejects with a user-displayable message on permission denial or
  // missing geolocation API.
  const fetchByGeo = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setPrayerError("Geolocation not supported.");
        reject(new Error("Geolocation not supported."));
        return;
      }
      setPrayerLoading(true); setPrayerError("");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await fetchByCoords(pos.coords.latitude, pos.coords.longitude);
            resolve();
          } catch (e) { reject(e); }
        },
        (err) => {
          // Covers permission denial AND the 15s timeout below — without the
          // timeout option a device that never answers leaves the UI stuck
          // on "Asking…" forever. err.code: 1=denied, 2=unavailable, 3=timeout.
          const msg = err?.code === 1
            ? "Location permission denied."
            : err?.code === 3
              ? "Location timed out. Try again or enter a city."
              : "Couldn't get your location. Try entering a city.";
          setPrayerError(msg);
          setPrayerLoading(false);
          reject(new Error(msg));
        },
        { timeout: 15000, maximumAge: 0 }
      );
    });
  }, [fetchByCoords]);

  // Change the calculation method / Asr madhab. Persist it, sync calcRef
  // synchronously (so the immediate re-fetch uses the NEW value, not the stale
  // debounced setting round-trip), and re-fetch the SAME location so the arc
  // updates in place. No-op re-fetch if no location has resolved yet — the
  // first city/geo fetch will pick up the new setting from the ref.
  const setPrayerCalc = useCallback((method, school) => {
    const m = normalizeMethod(method);
    const s = normalizeSchool(school);
    calcRef.current = { method: m, school: s };
    updateSettings((prev) => ({ ...prev, prayerMethod: m, prayerSchool: s }));
    const loc = lastLocRef.current;
    if (loc?.kind === "city") fetchPrayers(loc.city, loc.country);
    else if (loc?.kind === "coords") fetchByCoords(loc.lat, loc.lng, { persist: false });
  }, [updateSettings, fetchPrayers, fetchByCoords]);

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

  // Auto-clear prayer-fetch errors so a stale "City not found" doesn't
  // sit on the screen indefinitely after the user has moved on. 8s gives
  // enough time to read.
  useEffect(() => {
    if (!prayerError) return;
    const t = setTimeout(() => setPrayerError(""), 8000);
    return () => clearTimeout(t);
  }, [prayerError]);

  // Mirror today's prayer times to the notifications field so the server
  // cron (which can't call Aladhan per-tick) has authoritative times to
  // match against. Skip the write when the stored payload is already today's
  // and within a minute of what we computed — see prayerTimesMirrorFresh.
  // WITHOUT that tolerance, two open app instances whose Aladhan fetches
  // disagree by a single minute each rewrite the other's value on every
  // snapshot: an infinite write ping-pong that pulses "Saving…" while idle
  // and burns Firestore quota. A strict === on the five times was the bug.
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
    if (prayerTimesMirrorFresh(notifications?.prayerTimes, today, times)) return;
    // Functional updater (not a spread of the `notifications` snapshot) so a
    // concurrent notifications write still in the debounce window — e.g. an
    // FCM-token registration or a per-prayer toggle — isn't clobbered by a
    // stale render value.
    updateNotifications((prev) => ({ ...prev, prayerTimes: { date: today, times } }));
  }, [prayerTimes, notifications, updateNotifications]);

  return {
    prayerTimes,
    prayerCity,
    cityInput,
    countryInput,
    prayerLoading,
    prayerError,
    hijriDate,
    prayerMethod,
    prayerSchool,
    setPrayerTimes,
    setCityInput,
    setCountryInput,
    fetchPrayers,
    fetchByGeo,
    setPrayerCalc,
  };
}
