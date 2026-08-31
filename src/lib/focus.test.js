import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  getSecondsFromMinutes, getFocusSeconds, getBreakSeconds,
  fmtTime, fmtMins, focusStreakDays, STREAK_MILESTONES,
  minsForDay, parseDuration, durationInputValue,
} from "./focus";
import { todayStr, addDaysToStr } from "./dates";

describe("getSecondsFromMinutes", () => {
  it("converts and rounds, clamps at 0", () => {
    expect(getSecondsFromMinutes(25)).toBe(1500);
    expect(getSecondsFromMinutes(0.4)).toBe(0);
    expect(getSecondsFromMinutes(-5)).toBe(0);
  });
});

describe("getFocusSeconds", () => {
  const durations = { defaultFocus: 60, break: 10 };
  it("uses the task eta when present", () => {
    expect(getFocusSeconds(25, durations)).toBe(1500);
  });
  it("falls back to defaultFocus when eta is falsy", () => {
    expect(getFocusSeconds(0, durations)).toBe(3600);
    expect(getFocusSeconds(null, durations)).toBe(3600);
    expect(getFocusSeconds(undefined, durations)).toBe(3600);
  });
});

describe("getBreakSeconds", () => {
  it("reads the break duration", () => {
    expect(getBreakSeconds({ defaultFocus: 60, break: 10 })).toBe(600);
  });
});

describe("fmtTime", () => {
  it("formats MM:SS zero-padded", () => {
    expect(fmtTime(0)).toBe("00:00");
    expect(fmtTime(65)).toBe("01:05");
    expect(fmtTime(3599)).toBe("59:59");
  });
});

describe("fmtMins", () => {
  it("formats minutes and hours", () => {
    expect(fmtMins(45)).toBe("45m");
    expect(fmtMins(60)).toBe("1h");
    expect(fmtMins(83)).toBe("1h 23m");
  });
});

describe("focusStreakDays", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  const entry = (day, mins) => ({ id: day + mins, day, mins });

  it("counts consecutive days meeting the goal, back from today", () => {
    const log = [
      entry(todayStr(), 60),
      entry(addDaysToStr(todayStr(), -1), 60),
      entry(addDaysToStr(todayStr(), -2), 90),
    ];
    expect(focusStreakDays(log, 60)).toBe(3);
  });

  it("sums multiple sessions within a day toward the goal", () => {
    const log = [entry(todayStr(), 30), entry(todayStr(), 40)];
    expect(focusStreakDays(log, 60)).toBe(1); // 70 >= 60
  });

  it("today below goal does not break the streak (yesterday still counts)", () => {
    const log = [
      entry(todayStr(), 10), // below goal today
      entry(addDaysToStr(todayStr(), -1), 60),
    ];
    expect(focusStreakDays(log, 60)).toBe(1);
  });

  it("a missed day breaks it", () => {
    const log = [
      entry(todayStr(), 60),
      entry(addDaysToStr(todayStr(), -2), 60), // -1 missing
    ];
    expect(focusStreakDays(log, 60)).toBe(1);
  });

  it("empty log → 0", () => {
    expect(focusStreakDays([], 60)).toBe(0);
    expect(focusStreakDays(null, 60)).toBe(0);
  });
});

describe("STREAK_MILESTONES", () => {
  it("is the expected ascending set", () => {
    expect(STREAK_MILESTONES).toEqual([7, 14, 30, 60, 100, 200, 365]);
  });
});

describe("minsForDay", () => {
  const log = [
    { day: "2026-06-15", mins: 25 },
    { day: "2026-06-15", mins: 40 },
    { day: "2026-06-14", mins: 10 },
    { day: "2026-06-13" }, // no mins
  ];
  it("sums the minutes logged on a given day", () => {
    expect(minsForDay(log, "2026-06-15")).toBe(65);
    expect(minsForDay(log, "2026-06-14")).toBe(10);
  });
  it("treats a missing mins field as 0", () => {
    expect(minsForDay(log, "2026-06-13")).toBe(0);
  });
  it("is 0 for a day with no entries", () => {
    expect(minsForDay(log, "2026-01-01")).toBe(0);
    expect(minsForDay([], "2026-06-15")).toBe(0);
  });
});

describe("parseDuration", () => {
  it("parses plain minutes", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("90m")).toBe(90);
  });
  it("parses whole and fractional hours", () => {
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("1.5h")).toBe(90);
  });
  it("parses hours+minutes in h and colon forms", () => {
    expect(parseDuration("2h30")).toBe(150);
    expect(parseDuration("2:30")).toBe(150);
    expect(parseDuration("2h30m")).toBe(150);
  });
  it("is whitespace/case tolerant", () => {
    expect(parseDuration("  2H 30 ")).toBe(150);
  });
  it("returns null for unparseable or empty input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("   ")).toBeNull();
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });
});

describe("durationInputValue", () => {
  it("keeps sub-hour minutes as a plain number", () => {
    expect(durationInputValue(90)).toBe("1h30");
    expect(durationInputValue(45)).toBe("45");
  });
  it("uses the compact hour form for whole hours", () => {
    expect(durationInputValue(120)).toBe("2h");
    expect(durationInputValue(60)).toBe("1h");
  });
  it("round-trips through parseDuration", () => {
    for (const m of [30, 45, 60, 90, 120, 150]) {
      expect(parseDuration(durationInputValue(m))).toBe(m);
    }
  });
});
