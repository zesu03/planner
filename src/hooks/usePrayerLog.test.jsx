// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

// Make day-attribution deterministic: prayerDayFor resolves to "today" (the
// lib helper's own timezone/night-prayer rules are covered in lib/prayer's
// tests). qazaAfterRetroToggle stays real so we assert the ledger sync fires.
vi.mock("../lib/prayer", () => ({ prayerDayFor: (_p, _t, todayStrFn) => todayStrFn() }));

import { usePrayerLog } from "./usePrayerLog";

const NOON = new Date("2026-08-31T12:00:00Z");
const TODAY = "2026-08-31";

function setup(over = {}) {
  const applyPrayerLogUpdate = vi.fn();
  const applyQazaUpdate = vi.fn();
  const props = {
    prayerLog: {},
    prayerTimes: { Fajr: "05:00", Dhuhr: "12:30" },
    applyPrayerLogUpdate,
    applyQazaUpdate,
    ...over,
  };
  const { result } = renderHook(() => usePrayerLog(props));
  return { result, applyPrayerLogUpdate, applyQazaUpdate };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOON); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("usePrayerLog.togglePrayerLogOnDay", () => {
  it("marks a past day: prepends to prayerLog and syncs the qaza ledger", () => {
    const { result, applyPrayerLogUpdate, applyQazaUpdate } = setup();
    result.current.togglePrayerLogOnDay("Fajr", "2026-08-30");
    const next = applyPrayerLogUpdate.mock.calls[0][0]({});
    expect(next).toEqual({ Fajr: ["2026-08-30"] });
    expect(applyQazaUpdate).toHaveBeenCalledTimes(1);
  });

  it("unmarks a marked day", () => {
    const { result, applyPrayerLogUpdate } = setup();
    result.current.togglePrayerLogOnDay("Fajr", "2026-08-30");
    const next = applyPrayerLogUpdate.mock.calls[0][0]({ Fajr: ["2026-08-30", "2026-08-29"] });
    expect(next).toEqual({ Fajr: ["2026-08-29"] });
  });

  it("refuses a future day (no writes)", () => {
    const { result, applyPrayerLogUpdate, applyQazaUpdate } = setup();
    result.current.togglePrayerLogOnDay("Fajr", "2026-09-01");
    expect(applyPrayerLogUpdate).not.toHaveBeenCalled();
    expect(applyQazaUpdate).not.toHaveBeenCalled();
  });

  it("blocks marking a prayer whose window hasn't opened yet today", () => {
    vi.setSystemTime(new Date("2026-08-31T04:00:00Z")); // before Fajr 05:00
    const { result, applyPrayerLogUpdate } = setup();
    result.current.togglePrayerLog("Fajr"); // resolves to today
    expect(applyPrayerLogUpdate).not.toHaveBeenCalled();
  });

  it("still allows UNMARKING a prayer before its window (only marking is gated)", () => {
    vi.setSystemTime(new Date("2026-08-31T04:00:00Z"));
    const { result, applyPrayerLogUpdate } = setup({ prayerLog: { Fajr: [TODAY] } });
    result.current.togglePrayerLog("Fajr");
    const next = applyPrayerLogUpdate.mock.calls[0][0]({ Fajr: [TODAY] });
    expect(next).toEqual({ Fajr: [] });
  });
});

describe("usePrayerLog.canMarkPrayer / prayerDoneToday", () => {
  it("canMarkPrayer is false before the window and true after", () => {
    vi.setSystemTime(new Date("2026-08-31T04:00:00Z"));
    expect(setup().result.current.canMarkPrayer("Fajr")).toBe(false);
    vi.setSystemTime(new Date("2026-08-31T06:00:00Z"));
    expect(setup().result.current.canMarkPrayer("Fajr")).toBe(true);
  });

  it("prayerDoneToday reflects today's log", () => {
    const done = setup({ prayerLog: { Dhuhr: [TODAY] } }).result.current;
    expect(done.prayerDoneToday("Dhuhr")).toBe(true);
    expect(done.prayerDoneToday("Fajr")).toBe(false);
  });
});

describe("usePrayerLog.prayerStreak", () => {
  it("counts consecutive days back from the active prayer day", () => {
    const log = { Fajr: ["2026-08-31", "2026-08-30", "2026-08-29"] };
    expect(setup({ prayerLog: log }).result.current.prayerStreak("Fajr")).toBe(3);
  });

  it("stops at the first gap", () => {
    const log = { Fajr: ["2026-08-31", "2026-08-29"] }; // 30th missing
    expect(setup({ prayerLog: log }).result.current.prayerStreak("Fajr")).toBe(1);
  });

  it("is 0 when today (the active day) isn't logged", () => {
    const log = { Fajr: ["2026-08-30"] };
    expect(setup({ prayerLog: log }).result.current.prayerStreak("Fajr")).toBe(0);
  });
});
