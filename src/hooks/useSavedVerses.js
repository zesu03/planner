import { useCallback } from "react";
import { newId } from "../lib/ids";

// Saved verses — the user's collection of bookmarked ayat from the
// verse-of-day card. De-duped by verseKey (re-saving the same verse is a
// no-op that returns the same array reference → no write), newest-first.
//
// Data-only, mirroring the useGoals pattern: the styled-confirm wrapper for
// the remove action stays in the consumer (it's a UI concern). Extracted from
// Planner.jsx during the Phase 3 modular refactor.
export function useSavedVerses({ savedVerses, applySavedVersesUpdate }) {
  const saveVerse = useCallback((verse) => {
    if (!verse?.verseKey) return;
    applySavedVersesUpdate((arr) => {
      if (arr.some((v) => v.verseKey === verse.verseKey)) return arr;
      const entry = {
        id: newId(),
        verseKey: verse.verseKey,
        arabic: verse.arabic || "",
        translation: verse.translation || "",
        url: verse.url || `https://quran.com/${verse.verseKey}`,
        savedAt: new Date().toISOString(),
      };
      return [entry, ...arr];
    });
  }, [applySavedVersesUpdate]);

  const removeSavedVerse = useCallback((id) => {
    applySavedVersesUpdate((arr) => arr.filter((v) => v.id !== id));
  }, [applySavedVersesUpdate]);

  const isVerseSaved = useCallback(
    (verseKey) => savedVerses.some((v) => v.verseKey === verseKey),
    [savedVerses]
  );

  return { saveVerse, removeSavedVerse, isVerseSaved };
}
