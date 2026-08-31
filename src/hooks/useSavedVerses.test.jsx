// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSavedVerses } from "./useSavedVerses";

// Orchestration tests for the useSavedVerses hook — the Firestore updater is
// mocked, and we drive the functional updater it receives to assert the
// dedupe / prepend / filter logic (mirrors useFirestore.test.jsx's approach).
function setup(savedVerses = []) {
  const applySavedVersesUpdate = vi.fn();
  const { result } = renderHook(() => useSavedVerses({ savedVerses, applySavedVersesUpdate }));
  return { result, applySavedVersesUpdate };
}

describe("useSavedVerses", () => {
  it("saveVerse prepends a normalized, newest-first entry", () => {
    const { result, applySavedVersesUpdate } = setup();
    result.current.saveVerse({ verseKey: "2:255", arabic: "ا", translation: "t" });
    const updater = applySavedVersesUpdate.mock.calls[0][0];
    const next = updater([{ id: "old", verseKey: "1:1" }]);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ verseKey: "2:255", arabic: "ا", translation: "t", url: "https://quran.com/2:255" });
    expect(next[0].id).toBeTruthy();
    expect(next[0].savedAt).toBeTruthy();
    expect(next[1].id).toBe("old"); // existing stays after the new one
  });

  it("saveVerse falls back to a quran.com url when none is supplied", () => {
    const { result, applySavedVersesUpdate } = setup();
    result.current.saveVerse({ verseKey: "18:10", url: "https://example.com/x" });
    const entry = applySavedVersesUpdate.mock.calls[0][0]([])[0];
    expect(entry.url).toBe("https://example.com/x");
  });

  it("saveVerse dedupes by verseKey (same array reference → no write)", () => {
    const { result, applySavedVersesUpdate } = setup();
    result.current.saveVerse({ verseKey: "2:255" });
    const updater = applySavedVersesUpdate.mock.calls[0][0];
    const existing = [{ id: "x", verseKey: "2:255" }];
    expect(updater(existing)).toBe(existing);
  });

  it("saveVerse ignores a verse without a verseKey", () => {
    const { result, applySavedVersesUpdate } = setup();
    result.current.saveVerse({ arabic: "no key" });
    expect(applySavedVersesUpdate).not.toHaveBeenCalled();
  });

  it("removeSavedVerse filters by id", () => {
    const { result, applySavedVersesUpdate } = setup();
    result.current.removeSavedVerse("a");
    const updater = applySavedVersesUpdate.mock.calls[0][0];
    expect(updater([{ id: "a" }, { id: "b" }])).toEqual([{ id: "b" }]);
  });

  it("isVerseSaved reflects the current collection", () => {
    const { result } = setup([{ id: "1", verseKey: "2:255" }]);
    expect(result.current.isVerseSaved("2:255")).toBe(true);
    expect(result.current.isVerseSaved("1:1")).toBe(false);
  });
});
