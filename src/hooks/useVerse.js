// Verse-of-day hook. Owns the verseOfDay state, the network fetch, the
// localStorage cache keyed by date, and the fallback verse for failure
// modes. Lives outside Planner so a "verse" feature change (different
// translation, multiple verses, bookmarking) doesn't require touching the
// orchestrator.
//
// Cache key: `aakhirah_votd`. Stores the full verse payload plus a `day`
// field — first load of a new day fetches; later loads in the same day
// read from cache. `refresh()` clears the cache and re-fetches so the user
// can intentionally pull a new verse.

import { useCallback, useEffect, useState } from "react";
import { FALLBACK_VERSE } from "../lib/constants";
import { todayStr } from "../lib/dates";

const STORAGE_KEY = "aakhirah_votd";
const REQUEST_TIMEOUT_MS = 8000;

export function useVerse() {
  const [verseOfDay, setVerseOfDay] = useState(null);
  const [verseError, setVerseError] = useState("");

  const fetchVerse = useCallback(async () => {
    const today = todayStr();
    setVerseError("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(
        "https://api.quran.com/api/v4/verses/random?fields=text_uthmani&translations=20",
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("Quran API request failed");
      const json = await res.json();
      const v = json?.verse;
      const verseKey = v?.verse_key || FALLBACK_VERSE.verseKey;
      const arabic = v?.text_uthmani || "";
      const translation = (v?.translations?.[0]?.text || "").replace(/<[^>]*>/g, "");
      if (!arabic || !translation) {
        const fallback = { ...FALLBACK_VERSE, day: today };
        setVerseOfDay(fallback);
        setVerseError("Using a fallback verse. Please refresh to try again.");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
        return;
      }
      const payload = { day: today, verseKey, arabic, translation, url: `https://quran.com/${verseKey}` };
      setVerseOfDay(payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      setVerseOfDay({ ...FALLBACK_VERSE, day: today });
      setVerseError("Using a fallback verse. Please refresh to try again.");
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const refresh = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    fetchVerse();
  }, [fetchVerse]);

  // Initial load: try cache first, fetch only if today's verse isn't there.
  useEffect(() => {
    const today = todayStr();
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.day === today && parsed?.verseKey) {
          setVerseOfDay(parsed);
          return;
        }
      } catch { /* ignore cache parse errors */ }
    }
    fetchVerse();
  }, [fetchVerse]);

  return { verseOfDay, verseError, refresh };
}
