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

const ALADHAN_BASE = "https://api.aladhan.com/v1";
const METHOD_SCHOOL = "method=2&school=1";

export function usePrayer({ settingsFromDb, userSettings, updateSettings }) {
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
  // The city label comes from Aladhan's response timezone field (e.g.
  // "Asia/Karachi" → "Karachi") so the user sees a real place name
  // instead of the generic "Your location".
  const fetchByCoords = useCallback(async (lat, lng, { silent = false, persist = true } = {}) => {
    if (!silent) { setPrayerLoading(true); setPrayerError(""); }
    try {
      const ts = Math.floor(Date.now() / 1000);
      const res = await fetch(`${ALADHAN_BASE}/timings/${ts}?latitude=${lat}&longitude=${lng}&${METHOD_SCHOOL}`);
      const data = await res.json();
      if (data.code === 200) {
        setPrayerTimes(data.data.timings);
        const tz = data.data.meta?.timezone || "";
        // "Asia/Karachi" → "Karachi"; underscores ("New_York") become spaces.
        const tzCity = tz.split("/").pop().replace(/_/g, " ").trim();
        const label = tzCity ? `${tzCity} · your location` : "Your location";
        setPrayerCity(label);
        const h = data.data.date.hijri;
        setHijriDate(`${h.day} ${h.month.en} ${h.year} AH`);
        if (persist) {
          updateSettings({
            ...userSettings,
            prayerLat: lat,
            prayerLng: lng,
            // Clear city-based fields so restore picks the lat/lng path.
            prayerCity: null,
            prayerCountry: null,
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
  // object from useUserData (may be null on first render). The ref makes
  // sure we only run once even if Firestore re-emits the same snapshot.
  // Prefers lat/lng over city/country when both are present — the geo
  // path is more recent because fetchByCoords clears prayerCity on save.
  useEffect(() => {
    if (settingsAppliedRef.current || !settingsFromDb) return;
    if (settingsFromDb.prayerLat != null && settingsFromDb.prayerLng != null) {
      settingsAppliedRef.current = true;
      fetchByCoords(settingsFromDb.prayerLat, settingsFromDb.prayerLng, { silent: true, persist: false });
    } else if (settingsFromDb.prayerCity && settingsFromDb.prayerCountry) {
      settingsAppliedRef.current = true;
      setCityInput(settingsFromDb.prayerCity);
      setCountryInput(settingsFromDb.prayerCountry);
      fetchPrayersFromSettings(settingsFromDb.prayerCity, settingsFromDb.prayerCountry);
    }
  }, [settingsFromDb, fetchPrayersFromSettings, fetchByCoords]);

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
