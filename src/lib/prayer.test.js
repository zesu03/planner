import { describe, it, expect } from "vitest";
import { isFriday, prayerDisplayName, nextPrayer, prayerTimesMirrorFresh } from "./prayer";

// 2026-08-07 is a Friday; 08-06 Thu, 08-08 Sat. (TZ pinned to UTC in config.)
describe("isFriday", () => {
  it("true for a Friday", () => {
    expect(isFriday("2026-08-07")).toBe(true);
  });
  it("false for other days / bad input", () => {
    expect(isFriday("2026-08-06")).toBe(false);
    expect(isFriday("2026-08-08")).toBe(false);
    expect(isFriday("")).toBe(false);
    expect(isFriday(null)).toBe(false);
  });
});

describe("prayerDisplayName", () => {
  it("relabels Friday Dhuhr as Jumu'ah", () => {
    expect(prayerDisplayName("Dhuhr", "2026-08-07")).toBe("Jumu'ah");
  });
  it("keeps Dhuhr on non-Fridays", () => {
    expect(prayerDisplayName("Dhuhr", "2026-08-06")).toBe("Dhuhr");
  });
  it("never relabels the other prayers", () => {
    for (const p of ["Fajr", "Asr", "Maghrib", "Isha"]) {
      expect(prayerDisplayName(p, "2026-08-07")).toBe(p);
    }
  });
});

// The "due now" card must resolve Isha's done-state against the SAME day the
// mark lands on (prayerDayFor attributes a pre-Fajr Isha to yesterday).
// Without prevDay-awareness the card stayed "Mark prayed" after marking, and
// each tap re-toggled last night's mark. (TZ pinned to UTC in config, so a
// Date's getHours() reads the UTC wall clock.)
describe("nextPrayer — post-midnight Isha attribution", () => {
  const times = { Fajr: "05:00", Sunrise: "06:30", Dhuhr: "12:00", Asr: "16:00", Maghrib: "19:00", Isha: "20:30" };
  const preFajr = new Date("2026-08-06T00:30:00Z"); // 00:30 local — Isha window still open
  const today = "2026-08-06";
  const prevDay = "2026-08-05";

  it("is due when last night's Isha is unmarked", () => {
    expect(nextPrayer(times, {}, today, preFajr, prevDay)).toMatchObject({ name: "Isha", due: true });
  });

  it("clears once last night's Isha is marked on the attributed (previous) day", () => {
    const np = nextPrayer(times, { Isha: [prevDay] }, today, preFajr, prevDay);
    expect(np.due).toBeFalsy();
    expect(np.name).toBe("Fajr"); // next upcoming today, not the still-due Isha
  });

  it("a mark on today (wrong day) does NOT clear the pre-Fajr due card", () => {
    expect(nextPrayer(times, { Isha: [today] }, today, preFajr, prevDay)).toMatchObject({ name: "Isha", due: true });
  });

  it("evening Isha (before midnight) still attributes to today", () => {
    const evening = new Date("2026-08-06T21:00:00Z"); // 21:00 local — after Isha start
    expect(nextPrayer(times, {}, today, evening, prevDay)).toMatchObject({ name: "Isha", due: true });
    expect(nextPrayer(times, { Isha: [today] }, today, evening, prevDay).due).toBeFalsy();
  });
});

// Guards the reminder-mirror write ping-pong: two open app instances whose
// Aladhan fetches disagree by one minute must NOT keep rewriting each other's
// notifications.prayerTimes on every snapshot (the "Saving… every 1s while
// idle" bug that silently burned Firestore quota).
describe("prayerTimesMirrorFresh — anti-ping-pong tolerance", () => {
  const today = "2026-08-06";
  const times = { Fajr: "05:00", Dhuhr: "12:19", Asr: "16:46", Maghrib: "18:36", Isha: "19:37" };
  const stored = (over = {}) => ({ date: today, times: { ...times, ...over } });

  it("exact match for today is fresh (no write)", () => {
    expect(prayerTimesMirrorFresh(stored(), today, times)).toBe(true);
  });

  it("a 1-minute Isha jitter is treated as fresh — the exact ping-pong case", () => {
    // stored 19:38 vs computed 19:37 → the two-client fight must stop here.
    expect(prayerTimesMirrorFresh(stored({ Isha: "19:38" }), today, times)).toBe(true);
    expect(prayerTimesMirrorFresh(stored({ Isha: "19:36" }), today, times)).toBe(true);
  });

  it("a real shift (city change) exceeds tolerance → not fresh (write)", () => {
    expect(prayerTimesMirrorFresh(stored({ Isha: "19:52" }), today, times)).toBe(false);
    expect(prayerTimesMirrorFresh(stored({ Dhuhr: "12:25" }), today, times)).toBe(false);
  });

  it("a different (stale) date is never fresh → write", () => {
    expect(prayerTimesMirrorFresh({ date: "2026-08-05", times }, today, times)).toBe(false);
  });

  it("missing / malformed stored mirror is never fresh → write", () => {
    expect(prayerTimesMirrorFresh(null, today, times)).toBe(false);
    expect(prayerTimesMirrorFresh({ date: today }, today, times)).toBe(false);
    expect(prayerTimesMirrorFresh(stored({ Isha: undefined }), today, times)).toBe(false);
  });
});
