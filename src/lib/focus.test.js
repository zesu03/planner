import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  getSecondsFromMinutes, getFocusSeconds, getBreakSeconds,
  fmtTime, fmtMins, focusStreakDays, STREAK_MILESTONES,
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
