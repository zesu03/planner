import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  isRecurring, isScheduledOn, isDoneOn,
  oneShotTasks, recurringTasks, isGoalDone, pct,
  scheduleLabel, recurringStreak, recurringCompletionRate,
} from "./goals";
import { todayStr, addDaysToStr } from "./dates";

// Pin "now" so streak walks are deterministic. 2026-06-15 is a Monday (UTC).
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const oneShot = (over = {}) => ({ id: "t", text: "x", priority: "Medium", eta: 30, done: false, ...over });
const daily = (completions = []) => ({ id: "h", text: "h", recurring: { type: "daily" }, completions });
const weekly = (days, completions = []) => ({ id: "w", text: "w", recurring: { type: "weekly", days }, completions });

describe("isRecurring", () => {
  it("true only for tasks with a recurring.type", () => {
    expect(isRecurring(oneShot())).toBe(false);
    expect(isRecurring(daily())).toBe(true);
    expect(isRecurring(null)).toBe(false);
  });
});

describe("isScheduledOn", () => {
  it("one-shot tasks are always schedulable", () => {
    expect(isScheduledOn(oneShot(), "2026-06-15")).toBe(true);
  });
  it("daily habits are always scheduled", () => {
    expect(isScheduledOn(daily(), "2026-06-15")).toBe(true);
  });
  it("weekly habit scheduled only on its days (Mon=1)", () => {
    expect(isScheduledOn(weekly([1, 4]), "2026-06-15")).toBe(true);   // Monday
    expect(isScheduledOn(weekly([1, 4]), "2026-06-16")).toBe(false);  // Tuesday
    expect(isScheduledOn(weekly([4]), "2026-06-18")).toBe(true);      // Thursday
  });
  it("weekly with empty days = every day", () => {
    expect(isScheduledOn(weekly([]), "2026-06-16")).toBe(true);
  });
});

describe("isDoneOn", () => {
  it("one-shot reads done", () => {
    expect(isDoneOn(oneShot({ done: true }))).toBe(true);
    expect(isDoneOn(oneShot({ done: false }))).toBe(false);
  });
  it("recurring reads the completions array", () => {
    expect(isDoneOn(daily(["2026-06-15"]), "2026-06-15")).toBe(true);
    expect(isDoneOn(daily(["2026-06-14"]), "2026-06-15")).toBe(false);
  });
});

describe("oneShotTasks / recurringTasks", () => {
  it("partition the tasks array", () => {
    const g = { tasks: [oneShot(), daily(), oneShot({ id: "t2" })] };
    expect(oneShotTasks(g)).toHaveLength(2);
    expect(recurringTasks(g)).toHaveLength(1);
  });
  it("tolerate missing goal/tasks", () => {
    expect(oneShotTasks(null)).toEqual([]);
    expect(recurringTasks({})).toEqual([]);
  });
});

describe("isGoalDone", () => {
  it("done when completedAt stamped", () => {
    expect(isGoalDone({ completedAt: "2026-06-15", tasks: [] })).toBe(true);
  });
  it("done when all one-shot tasks are done", () => {
    expect(isGoalDone({ tasks: [oneShot({ done: true }), oneShot({ id: "t2", done: true })] })).toBe(true);
    expect(isGoalDone({ tasks: [oneShot({ done: true }), oneShot({ id: "t2", done: false })] })).toBe(false);
  });
  it("habit-only goal never auto-completes", () => {
    expect(isGoalDone({ tasks: [daily(["2026-06-15"])] })).toBe(false);
  });
  it("no tasks = not done", () => {
    expect(isGoalDone({ tasks: [] })).toBe(false);
    expect(isGoalDone(null)).toBe(false);
  });
});

describe("pct", () => {
  it("based on one-shot tasks only", () => {
    expect(pct({ tasks: [oneShot({ done: true }), oneShot({ id: "t2", done: false })] })).toBe(50);
  });
  it("habit-only goal is 0%", () => {
    expect(pct({ tasks: [daily(["2026-06-15"])] })).toBe(0);
  });
  it("rounds", () => {
    expect(pct({ tasks: [oneShot({ done: true }), oneShot({ id: "b", done: false }), oneShot({ id: "c", done: false })] })).toBe(33);
  });
});

describe("scheduleLabel", () => {
  it("formats daily / weekly / all-week", () => {
    expect(scheduleLabel({ type: "daily" })).toBe("Daily");
    expect(scheduleLabel({ type: "weekly", days: [1, 4] })).toBe("Mon, Thu");
    expect(scheduleLabel({ type: "weekly", days: [] })).toBe("Weekly");
    expect(scheduleLabel({ type: "weekly", days: [0, 1, 2, 3, 4, 5, 6] })).toBe("Daily");
    expect(scheduleLabel(null)).toBeNull();
  });
});

describe("recurringStreak", () => {
  it("counts consecutive completed days back from today (daily)", () => {
    const today = todayStr();
    const completions = [today, addDaysToStr(today, -1), addDaysToStr(today, -2)];
    expect(recurringStreak(daily(completions))).toBe(3);
  });
  it("today not ticked yet does not break the streak", () => {
    const completions = [addDaysToStr(todayStr(), -1), addDaysToStr(todayStr(), -2)];
    expect(recurringStreak(daily(completions))).toBe(2);
  });
  it("a gap breaks it", () => {
    const completions = [todayStr(), addDaysToStr(todayStr(), -2)]; // missing -1
    expect(recurringStreak(daily(completions))).toBe(1);
  });
  it("non-recurring → 0", () => {
    expect(recurringStreak(oneShot())).toBe(0);
  });
});

describe("recurringCompletionRate", () => {
  it("fraction of scheduled days completed in the window", () => {
    const completions = [todayStr(), addDaysToStr(todayStr(), -1)];
    // daily → every day scheduled; 2 of last 4 done
    expect(recurringCompletionRate(daily(completions), 4)).toBeCloseTo(0.5, 5);
  });
  it("non-recurring → null", () => {
    expect(recurringCompletionRate(oneShot())).toBeNull();
  });
});
