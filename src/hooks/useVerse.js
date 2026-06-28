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

import { useCallback, useEffect, useRef, useState } from "react";
import { FALLBACK_VERSE } from "../lib/constants";
import { todayStr } from "../lib/dates";

const STORAGE_KEY = "aakhirah_votd";
const REQUEST_TIMEOUT_MS = 8000;

export function useVerse() {
  const [verseOfDay, setVerseOfDay] = useState(null);
  const [verseError, setVerseError] = useState("");
  // Monotonic token so an older in-flight fetch (e.g. the mount fetch when
  // the user immediately taps refresh) can't overwrite a newer one's result
  // or clobber the freshly-cached payload.
  const fetchSeqRef = useRef(0);

  // Tiny localStorage wrappers so quota / private-mode throws don't bubble
  // up and replace verseOfDay with undefined mid-set. Safari private mode
  // throws on setItem; Firefox sometimes throws on read after disk pressure.
  function lsRead(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function lsWrite(key, value) {
    try { localStorage.setItem(key, value); } catch { /* quota / private mode — silent */ }
  }
  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  const fetchVerse = useCallback(async () => {
    const today = todayStr();
    const mySeq = ++fetchSeqRef.current;
    const isStale = () => mySeq !== fetchSeqRef.current;
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
      if (isStale()) return;   // a newer fetch superseded this one
      const v = json?.verse;
      const verseKey = v?.verse_key || FALLBACK_VERSE.verseKey;
      const arabic = v?.text_uthmani || "";
      const translation = (v?.translations?.[0]?.text || "").replace(/<[^>]*>/g, "");
      if (!arabic || !translation) {
        // Show fallback but DO NOT cache it. Caching the fallback pins
        // it for the rest of the user's day — a single API blip then
        // means 24 hours of the same fallback verse with no auto-recovery.
        // Leaving the cache untouched lets the next mount retry the fetch.
        setVerseOfDay({ ...FALLBACK_VERSE, day: today });
        setVerseError("Using a fallback verse. Please refresh to try again.");
        return;
      }
      const payload = { day: today, verseKey, arabic, translation, url: `https://quran.com/${verseKey}` };
      setVerseOfDay(payload);
      lsWrite(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      if (isStale()) return;
      // Same "show but don't cache" rule for network failures.
      setVerseOfDay({ ...FALLBACK_VERSE, day: today });
      setVerseError("Using a fallback verse. Please refresh to try again.");
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const refresh = useCallback(() => {
    lsRemove(STORAGE_KEY);
    fetchVerse();
  }, [fetchVerse]);

  // Initial load: try cache first, fetch only if today's verse isn't there.
  useEffect(() => {
    const today = todayStr();
    const cached = lsRead(STORAGE_KEY);
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
