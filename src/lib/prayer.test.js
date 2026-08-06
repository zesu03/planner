import { describe, it, expect } from "vitest";
import { isFriday, prayerDisplayName, nextPrayer } from "./prayer";

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
