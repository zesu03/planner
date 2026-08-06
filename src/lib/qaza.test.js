import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  emptyQaza, qazaOwed, paidOnDay, isExcused,
  settleQaza, reconcileQaza,
  payQaza, undoQaza, addQaza, qazaAfterRetroToggle, addExcusedRange, removeExcusedRange,
  missedDaysForPrayer, QAZA_PRAYERS, QAZA_VERSION,
} from "./qaza";
import { todayStr, addDaysToStr } from "./dates";

// Pin "now" so startDate / yesterday windows are deterministic.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const ZERO = { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 };
const yesterday = () => addDaysToStr(todayStr(), -1);
// A settled v2 ledger anchored `n` days ago, with everything settled up to
// yesterday and the given owed/paid state.
const mk = (over = {}) => ({
  version: QAZA_VERSION,
  startDate: addDaysToStr(todayStr(), -5),
  lastSettledDate: yesterday(),
  owed: { ...ZERO },
  paidTotal: { ...ZERO },
  paidLog: {},
  excused: [],
  ...over,
});

describe("emptyQaza", () => {
  it("is a v2 ledger seeded to today with nothing owed or settled ahead", () => {
    const q = emptyQaza();
    expect(q.version).toBe(2);
    expect(q.startDate).toBe(todayStr());
    expect(q.lastSettledDate).toBe(yesterday());
    expect(q.owed).toEqual(ZERO);
    expect(q.paidTotal).toEqual(ZERO);
    expect(q.paidLog).toEqual({});
    expect(q.excused).toEqual([]);
  });
});

describe("qazaOwed / paidOnDay / isExcused", () => {
  it("qazaOwed reads the stored counter with a zeroed fallback", () => {
    expect(qazaOwed(mk({ owed: { ...ZERO, Fajr: 4 } })).Fajr).toBe(4);
    expect(qazaOwed(null)).toEqual(ZERO);
    expect(qazaOwed({})).toEqual(ZERO);
  });
  it("paidOnDay sums a day's makeups", () => {
    const q = mk({ paidLog: { [todayStr()]: { Fajr: 2, Isha: 1 } } });
    expect(paidOnDay(q)).toBe(3);
    expect(paidOnDay(q, addDaysToStr(todayStr(), -1))).toBe(0);
    expect(paidOnDay({})).toBe(0);
  });
  it("isExcused matches inclusive ranges", () => {
    const ex = [{ from: "2026-06-10", to: "2026-06-12" }];
    expect(isExcused("2026-06-10", ex)).toBe(true);
    expect(isExcused("2026-06-12", ex)).toBe(true);
    expect(isExcused("2026-06-13", ex)).toBe(false);
    expect(isExcused("2026-06-09", ex)).toBe(false);
  });
});

describe("settleQaza", () => {
  it("materialises unlogged past days into owed and advances lastSettledDate", () => {
    // startDate -3, lastSettledDate -3 → settles days -2 and -1 (today excluded).
    const q = mk({ startDate: addDaysToStr(todayStr(), -3), lastSettledDate: addDaysToStr(todayStr(), -3) });
    const out = settleQaza(q, {}, todayStr());
    for (const p of QAZA_PRAYERS) expect(out.owed[p]).toBe(2);
    expect(out.lastSettledDate).toBe(yesterday());
  });

  it("never counts today (today stays pending)", () => {
    const q = mk({ startDate: addDaysToStr(todayStr(), -1), lastSettledDate: addDaysToStr(todayStr(), -1) });
    const out = settleQaza(q, {}, todayStr());
    // from = today, to = yesterday → nothing to settle.
    expect(out).toBe(q);
  });

  it("does not count a day that was logged", () => {
    const q = mk({ startDate: addDaysToStr(todayStr(), -2), lastSettledDate: addDaysToStr(todayStr(), -2) });
    const d = addDaysToStr(todayStr(), -1);
    const out = settleQaza(q, { Fajr: [d] }, todayStr());
    expect(out.owed.Fajr).toBe(0); // only day -1 in range, and it's logged
    expect(out.owed.Dhuhr).toBe(1);
  });

  it("skips excused days", () => {
    const start = addDaysToStr(todayStr(), -3);
    const q = mk({ startDate: start, lastSettledDate: start, excused: [{ from: addDaysToStr(todayStr(), -2), to: addDaysToStr(todayStr(), -2) }] });
    const out = settleQaza(q, {}, todayStr());
    for (const p of QAZA_PRAYERS) expect(out.owed[p]).toBe(1); // day -2 excused, only -1 counts
  });

  it("is idempotent — re-settling returns the same reference", () => {
    const q = mk({ startDate: addDaysToStr(todayStr(), -3), lastSettledDate: addDaysToStr(todayStr(), -3) });
    const once = settleQaza(q, {}, todayStr());
    const twice = settleQaza(once, {}, todayStr());
    expect(twice).toBe(once);
  });

  it("catches up a multi-day absence in one pass", () => {
    const q = mk({ startDate: addDaysToStr(todayStr(), -10), lastSettledDate: addDaysToStr(todayStr(), -4) });
    const out = settleQaza(q, {}, todayStr());
    for (const p of QAZA_PRAYERS) expect(out.owed[p]).toBe(3); // days -3, -2, -1
  });
});

describe("reconcileQaza", () => {
  it("seeds a fresh ledger from null / empty", () => {
    const out = reconcileQaza(null, {}, todayStr());
    expect(out.version).toBe(2);
    expect(out.startDate).toBe(todayStr());
    expect(out.owed).toEqual(ZERO);
  });

  it("migrates a v1 ledger, preserving derived owed and paidTotal", () => {
    // v1: startDate -3, paid Fajr:1. Derived = 3 missed each, minus paid.
    const v1 = { startDate: addDaysToStr(todayStr(), -3), paid: { Fajr: 1 }, paidLog: { [todayStr()]: { Fajr: 1 } } };
    const out = reconcileQaza(v1, {}, todayStr());
    expect(out.version).toBe(2);
    expect(out.owed.Fajr).toBe(2); // 3 missed - 1 paid
    expect(out.owed.Dhuhr).toBe(3);
    expect(out.paidTotal.Fajr).toBe(1);
    expect(out.paidLog).toEqual({ [todayStr()]: { Fajr: 1 } });
    expect(out.lastSettledDate).toBe(yesterday());
  });

  it("is a no-op (same ref) for an already-settled v2 ledger", () => {
    const q = mk({ owed: { ...ZERO, Fajr: 3 } });
    expect(reconcileQaza(q, {}, todayStr())).toBe(q);
  });
});

describe("payQaza / undoQaza — exact inverses, no counter drift", () => {
  it("pay decrements owed and records the makeup under today", () => {
    const q = mk({ owed: { ...ZERO, Fajr: 3 } });
    const out = payQaza(q, "Fajr", todayStr());
    expect(out.owed.Fajr).toBe(2);
    expect(out.paidTotal.Fajr).toBe(1);
    expect(out.paidLog[todayStr()].Fajr).toBe(1);
  });

  it("pay is a no-op when nothing is owed (no phantom credit)", () => {
    const q = mk({ owed: { ...ZERO }, paidTotal: { ...ZERO, Fajr: 5 } });
    expect(payQaza(q, "Fajr", todayStr())).toBe(q);
  });

  it("undo only reverses a makeup logged TODAY", () => {
    const q = mk({ owed: { ...ZERO, Fajr: 2 } });
    const paid = payQaza(q, "Fajr", todayStr());
    const undone = undoQaza(paid, "Fajr", todayStr());
    expect(undone.owed.Fajr).toBe(2);
    expect(undone.paidTotal.Fajr).toBe(0);
    expect(paidOnDay(undone)).toBe(0);
  });

  it("undo is a no-op when nothing was made up today — the counter-bug guard", () => {
    // Lifetime paidTotal is high but nothing made up today: a stray − does
    // nothing, so a later + can't register a phantom 'made up today'.
    const q = mk({ owed: { ...ZERO, Fajr: 3 }, paidTotal: { ...ZERO, Fajr: 5 } });
    expect(undoQaza(q, "Fajr", todayStr())).toBe(q);
    const afterPlus = payQaza(q, "Fajr", todayStr());
    expect(paidOnDay(afterPlus)).toBe(1); // exactly the one just made up
    expect(afterPlus.owed.Fajr).toBe(2);
  });

  it("pay then undo returns every counter to baseline", () => {
    const q = mk({ owed: { ...ZERO, Fajr: 4 }, paidTotal: { ...ZERO, Fajr: 2 } });
    const round = undoQaza(payQaza(q, "Fajr", todayStr()), "Fajr", todayStr());
    expect(round.owed.Fajr).toBe(4);
    expect(round.paidTotal.Fajr).toBe(2);
    expect(round.paidLog[todayStr()]).toBeUndefined();
  });
});

describe("addQaza", () => {
  it("adds to owed and clamps at zero", () => {
    const q = mk({ owed: { ...ZERO, Fajr: 1 } });
    expect(addQaza(q, "Fajr", 730).owed.Fajr).toBe(731);
    expect(addQaza(q, "Fajr", -5).owed.Fajr).toBe(0);
    expect(addQaza(q, "Fajr", 0)).toBe(q);
  });
});

describe("qazaAfterRetroToggle", () => {
  it("clears owed when a settled day is marked prayed, restores on unmark", () => {
    const day = addDaysToStr(todayStr(), -2); // a settled day
    const q = mk({ owed: { ...ZERO, Fajr: 3 } });
    expect(qazaAfterRetroToggle(q, "Fajr", day, true).owed.Fajr).toBe(2);
    expect(qazaAfterRetroToggle(q, "Fajr", day, false).owed.Fajr).toBe(4);
  });
  it("is a no-op for today (unsettled), pre-startDate, or excused days", () => {
    const day = addDaysToStr(todayStr(), -2);
    const q = mk({ owed: { ...ZERO, Fajr: 3 }, excused: [{ from: day, to: day }] });
    expect(qazaAfterRetroToggle(q, "Fajr", todayStr(), true)).toBe(q); // today > lastSettled
    expect(qazaAfterRetroToggle(q, "Fajr", addDaysToStr(todayStr(), -99), true)).toBe(q); // < startDate
    expect(qazaAfterRetroToggle(q, "Fajr", day, true)).toBe(q); // excused
  });
});

describe("addExcusedRange / removeExcusedRange", () => {
  const start = () => addDaysToStr(todayStr(), -3);
  const three = { Fajr: 3, Dhuhr: 3, Asr: 3, Maghrib: 3, Isha: 3 };

  it("un-counts already-settled days that become excused", () => {
    const q = mk({ startDate: start(), owed: { ...three } });
    const d = addDaysToStr(todayStr(), -2);
    const out = addExcusedRange(q, d, d, "travel", {});
    for (const p of QAZA_PRAYERS) expect(out.owed[p]).toBe(2);
    expect(out.excused).toHaveLength(1);
  });

  it("round-trips: removing an excused range restores the owed count", () => {
    const q = mk({ startDate: start(), owed: { ...three } });
    const d = addDaysToStr(todayStr(), -2);
    const excusedQ = addExcusedRange(q, d, d, "travel", {});
    const back = removeExcusedRange(excusedQ, 0, {});
    for (const p of QAZA_PRAYERS) expect(back.owed[p]).toBe(3);
    expect(back.excused).toHaveLength(0);
  });

  it("does not double-restore a day still excused by another range", () => {
    const q = mk({ startDate: start(), owed: { ...three } });
    const d = addDaysToStr(todayStr(), -2);
    // Two overlapping ranges both covering day -2.
    let x = addExcusedRange(q, d, d, "travel", {});      // owed → 2
    x = addExcusedRange(x, d, d, "illness", {});          // already excused → owed unchanged (2)
    for (const p of QAZA_PRAYERS) expect(x.owed[p]).toBe(2);
    const back = removeExcusedRange(x, 0, {});            // still excused by range 1 → no re-count
    for (const p of QAZA_PRAYERS) expect(back.owed[p]).toBe(2);
    expect(back.excused).toHaveLength(1);
  });
});

describe("missedDaysForPrayer", () => {
  it("lists unlogged past days for a prayer", () => {
    const startDate = addDaysToStr(todayStr(), -3);
    const prayed = addDaysToStr(todayStr(), -2);
    const missed = missedDaysForPrayer({ Asr: [prayed] }, { startDate }, "Asr");
    expect(missed).toContain(addDaysToStr(todayStr(), -3));
    expect(missed).toContain(addDaysToStr(todayStr(), -1));
    expect(missed).not.toContain(prayed);
  });
});
