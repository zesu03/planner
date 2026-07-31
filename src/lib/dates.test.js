import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  todayStr, localDateStr, daysLeft, fmt, addDays,
  eachDayBetween, endOfYear, addDaysToStr, weekdayOf,
} from "./dates";

// TZ is pinned to UTC by vitest.config.js, so local == UTC here and the
// "today"-relative assertions below are exact.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("todayStr / localDateStr", () => {
  it("format the pinned date as YYYY-MM-DD", () => {
    expect(todayStr()).toBe("2026-06-15");
    expect(localDateStr(new Date("2026-01-02T00:00:00Z"))).toBe("2026-01-02");
  });
});

describe("addDaysToStr — pure, timezone-independent string math", () => {
  it("adds and subtracts across month/year boundaries", () => {
    expect(addDaysToStr("2026-06-15", 1)).toBe("2026-06-16");
    expect(addDaysToStr("2026-06-15", -1)).toBe("2026-06-14");
    expect(addDaysToStr("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToStr("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToStr("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("handles a leap day", () => {
    expect(addDaysToStr("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("daysLeft", () => {
  it("0 for today, positive future, negative overdue", () => {
    expect(daysLeft(todayStr())).toBe(0);
    expect(daysLeft(addDaysToStr(todayStr(), 7))).toBe(7);
    expect(daysLeft(addDaysToStr(todayStr(), -3))).toBe(-3);
  });
});

describe("addDays", () => {
  it("returns today + n as a date string", () => {
    expect(addDays(0)).toBe(todayStr());
    expect(addDays(7)).toBe(addDaysToStr(todayStr(), 7));
  });
});

describe("fmt", () => {
  it("renders DD/MM/YYYY, empty on falsy", () => {
    expect(fmt("2026-06-15")).toBe("15/06/2026");
    expect(fmt("")).toBe("");
    expect(fmt(null)).toBe("");
  });
});

describe("eachDayBetween", () => {
  it("is inclusive of start, exclusive of end", () => {
    expect(eachDayBetween("2026-06-13", "2026-06-16")).toEqual([
      "2026-06-13", "2026-06-14", "2026-06-15",
    ]);
  });
  it("empty when start >= end", () => {
    expect(eachDayBetween("2026-06-16", "2026-06-16")).toEqual([]);
  });
  it("crosses a month boundary", () => {
    expect(eachDayBetween("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30", "2026-01-31", "2026-02-01",
    ]);
  });
});

describe("endOfYear", () => {
  it("is Dec 31 of the current year", () => {
    expect(endOfYear()).toBe("2026-12-31");
  });
});

describe("weekdayOf", () => {
  it("names the weekday of a date string (UTC-anchored)", () => {
    expect(weekdayOf("2026-06-15")).toBe("Monday");
    expect(weekdayOf("2026-06-18")).toBe("Thursday");
  });
});
