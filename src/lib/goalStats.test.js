import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { focusRhythm, goalChecksWindow, lastActivityLabel } from "./goalStats";

// Characterization tests for the GoalDetail derivations, locking the
// behaviour of the IIFEs relocated out of views/GoalDetail.jsx. "Today" is
// pinned so the windows are deterministic (TZ=UTC is set by vitest.config.js,
// so localDateStr yields UTC calendar dates).

const NOW = new Date("2026-08-31T12:00:00Z");
const TODAY = "2026-08-31";

function day(offset) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("focusRhythm", () => {
  it("returns zeros and an empty series when the goal has no sessions", () => {
    expect(focusRhythm([], "g1")).toEqual({ last7Mins: 0, last30Mins: 0, lastActivityDay: null, series: [] });
    // sessions exist, but for a different goal
    expect(focusRhythm([{ goalId: "other", day: day(0), mins: 30 }], "g1").last30Mins).toBe(0);
  });

  it("windows minutes into 7d / 30d and builds a 14-day series", () => {
    const focusLog = [
      { goalId: "g1", day: day(0), mins: 30 },
      { goalId: "g1", day: day(-3), mins: 20 },
      { goalId: "g1", day: day(-10), mins: 15 },
      { goalId: "g1", day: day(-40), mins: 99 }, // outside 30d
      { goalId: "g2", day: day(0), mins: 999 }, // different goal
    ];
    const r = focusRhythm(focusLog, "g1");
    expect(r.last7Mins).toBe(50); // today + 3d ago
    expect(r.last30Mins).toBe(65); // + 10d ago, not the 40d one
    expect(r.lastActivityDay).toBe(day(0));
    expect(r.series).toHaveLength(14);
    expect(r.series[13]).toEqual({ day: day(0), mins: 30 }); // newest last
    expect(r.series[10]).toEqual({ day: day(-3), mins: 20 });
    expect(r.series.find((s) => s.day === day(-10))).toEqual({ day: day(-10), mins: 15 }); // within 14d
    expect(r.series.find((s) => s.day === day(-40))).toBeUndefined(); // outside 14d window
    expect(r.series.reduce((s, x) => s + x.mins, 0)).toBe(65); // in-window days only (30+20+15)
  });

  it("aggregates multiple sessions on the same day", () => {
    const focusLog = [
      { goalId: "g1", day: day(-1), mins: 10 },
      { goalId: "g1", day: day(-1), mins: 25 },
    ];
    const r = focusRhythm(focusLog, "g1");
    expect(r.last7Mins).toBe(35);
    expect(r.series[12]).toEqual({ day: day(-1), mins: 35 });
  });

  it("accepts an explicit `today` override", () => {
    const focusLog = [{ goalId: "g1", day: "2026-01-05", mins: 40 }];
    const r = focusRhythm(focusLog, "g1", "2026-01-05");
    expect(r.last7Mins).toBe(40);
    expect(r.lastActivityDay).toBe("2026-01-05");
  });
});

describe("goalChecksWindow", () => {
  it("returns null only when muhasaba is absent", () => {
    expect(goalChecksWindow(null, "g1")).toBeNull();
    expect(goalChecksWindow(undefined, "g1")).toBeNull();
    const empty = goalChecksWindow({}, "g1");
    expect(empty).not.toBeNull();
    expect(empty.days).toHaveLength(7);
    expect(empty.total).toBe(0);
    expect(empty.counts).toEqual({});
  });

  it("counts yes/partial/no verdicts over the last 7 nights", () => {
    const muhasaba = {
      [day(0)]: { goalChecks: { g1: "yes" } },
      [day(-1)]: { goalChecks: { g1: "partial" } },
      [day(-2)]: { goalChecks: { g1: "no" } },
      [day(-3)]: { goalChecks: { g1: "yes" } },
      [day(-8)]: { goalChecks: { g1: "yes" } }, // outside 7d window
      [day(-1) + "x"]: { goalChecks: { g1: "yes" } }, // junk key, ignored
    };
    const r = goalChecksWindow(muhasaba, "g1");
    expect(r.days).toHaveLength(7);
    expect(r.counts).toEqual({ yes: 2, partial: 1, no: 1 });
    expect(r.total).toBe(4);
    expect(r.days[6]).toEqual({ day: day(0), verdict: "yes" }); // today is last
  });

  it("scopes verdicts to the given goal id", () => {
    const muhasaba = { [day(0)]: { goalChecks: { g1: "yes", g2: "no" } } };
    expect(goalChecksWindow(muhasaba, "g1").counts).toEqual({ yes: 1 });
    expect(goalChecksWindow(muhasaba, "g2").counts).toEqual({ no: 1 });
    expect(goalChecksWindow(muhasaba, "g3").total).toBe(0);
  });
});

describe("lastActivityLabel", () => {
  it("labels relative days, or null when there's no activity", () => {
    expect(lastActivityLabel(null)).toBeNull();
    expect(lastActivityLabel(TODAY)).toBe("today");
    expect(lastActivityLabel(day(-1))).toBe("yesterday");
    expect(lastActivityLabel(day(-5))).toBe("5d ago");
    expect(lastActivityLabel(day(-30))).toBe("30d ago");
  });

  it("honours an explicit `today`", () => {
    expect(lastActivityLabel("2026-01-01", "2026-01-03")).toBe("2d ago");
    expect(lastActivityLabel("2026-01-03", "2026-01-03")).toBe("today");
  });
});
