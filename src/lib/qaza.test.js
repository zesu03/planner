import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { emptyQaza, computeQazaOwed, missedDaysForPrayer, QAZA_PRAYERS } from "./qaza";
import { todayStr, addDaysToStr } from "./dates";

// Pin "now" so startDate/yesterday windows are deterministic.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("emptyQaza", () => {
  it("seeds startDate to today with zeroed paid counters", () => {
    const q = emptyQaza();
    expect(q.startDate).toBe(todayStr());
    expect(q.paid).toEqual({ Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 });
  });
});

describe("computeQazaOwed (no prayerTimes → today excluded)", () => {
  it("counts every prayer missed on each past day", () => {
    // startDate = 3 days ago; days counted = [-3, -2, -1] (today excluded).
    const startDate = addDaysToStr(todayStr(), -3);
    const owed = computeQazaOwed({}, { startDate, paid: {} });
    for (const p of QAZA_PRAYERS) expect(owed[p]).toBe(3);
  });

  it("does not count a prayer that was logged", () => {
    const startDate = addDaysToStr(todayStr(), -2);
    const d1 = addDaysToStr(todayStr(), -2);
    const d2 = addDaysToStr(todayStr(), -1);
    const owed = computeQazaOwed({ Fajr: [d1, d2] }, { startDate, paid: {} });
    expect(owed.Fajr).toBe(0); // both days prayed
    expect(owed.Dhuhr).toBe(2); // none prayed
  });

  it("subtracts paid makeups, never going negative", () => {
    const startDate = addDaysToStr(todayStr(), -3);
    const owed = computeQazaOwed({}, { startDate, paid: { Fajr: 2, Dhuhr: 99 } });
    expect(owed.Fajr).toBe(1);   // 3 owed - 2 paid
    expect(owed.Dhuhr).toBe(0);  // clamped, not negative
  });

  it("returns all-zero when there is no startDate", () => {
    expect(computeQazaOwed({}, {})).toEqual({ Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 });
    expect(computeQazaOwed({}, null)).toEqual({ Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 });
  });

  it("startDate today → nothing owed yet (no past days, today skipped without prayerTimes)", () => {
    const owed = computeQazaOwed({}, { startDate: todayStr(), paid: {} });
    for (const p of QAZA_PRAYERS) expect(owed[p]).toBe(0);
  });

  it("tolerates a null prayerLog", () => {
    const startDate = addDaysToStr(todayStr(), -1);
    const owed = computeQazaOwed(null, { startDate, paid: {} });
    expect(owed.Fajr).toBe(1);
  });
});

describe("missedDaysForPrayer", () => {
  it("lists the specific unlogged past days for a prayer", () => {
    const startDate = addDaysToStr(todayStr(), -3);
    const prayed = addDaysToStr(todayStr(), -2);
    const missed = missedDaysForPrayer({ Asr: [prayed] }, { startDate, paid: {} }, "Asr");
    expect(missed).toContain(addDaysToStr(todayStr(), -3));
    expect(missed).toContain(addDaysToStr(todayStr(), -1));
    expect(missed).not.toContain(prayed);
  });
  it("empty when no startDate or startDate is today", () => {
    expect(missedDaysForPrayer({}, {}, "Fajr")).toEqual([]);
    expect(missedDaysForPrayer({}, { startDate: todayStr() }, "Fajr")).toEqual([]);
  });
});
