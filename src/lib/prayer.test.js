import { describe, it, expect } from "vitest";
import { isFriday, prayerDisplayName } from "./prayer";

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
