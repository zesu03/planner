// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { emptyQaza, addQaza, qazaOwed } from "../lib/qaza";
import { todayStr } from "../lib/dates";

// captureError is mocked so we can assert the wipe-guard tripwires still fire;
// lib/qaza stays REAL so the reconcile/settle/heal + pay logic is exercised
// exactly as in production.
vi.mock("../lib/monitoring", () => ({ captureError: vi.fn() }));
import { captureError } from "../lib/monitoring";
import { useQaza } from "./useQaza";

function setup(over = {}) {
  const updateQaza = vi.fn();
  const updateSettings = vi.fn();
  const props = {
    qazaFromDb: emptyQaza(todayStr()),
    prayerLog: {},
    prayerLogFromDb: {},
    loaded: true,
    uid: "u1",
    updateQaza,
    updateSettings,
    ...over,
  };
  const view = renderHook(() => useQaza(props));
  return { ...view, updateQaza, updateSettings };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("useQaza reconcile effect", () => {
  it("does not touch the ledger before the doc has loaded", () => {
    const { updateQaza } = setup({ loaded: false });
    expect(updateQaza).not.toHaveBeenCalled();
  });

  it("reconciles once loaded", () => {
    const { updateQaza } = setup({ loaded: true });
    expect(updateQaza).toHaveBeenCalledTimes(1);
  });

  it("fires the wipe-averted tripwire when the ledger is empty but prayerLog has history", () => {
    // Empty/startDate-less ledger + real prayer history = the account-wipe
    // signature reconcile refuses to seed over.
    setup({ qazaFromDb: {}, prayerLog: { Fajr: ["2026-06-01"] } });
    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ scope: "qaza-wipe-averted", uid: "u1" }),
    );
  });

  it("does not fire the tripwire for a healthy ledger", () => {
    setup(); // healthy emptyQaza(today), empty prayerLog
    const scopes = captureError.mock.calls.map((c) => c[1]?.scope);
    expect(scopes).not.toContain("qaza-wipe-averted");
  });
});

describe("useQaza make-up callbacks", () => {
  it("payOneQaza applies payQaza (owed 2 → 1)", () => {
    const { result, updateQaza } = setup();
    updateQaza.mockClear(); // ignore the mount-time reconcile call
    result.current.payOneQaza("Fajr");
    expect(updateQaza).toHaveBeenCalledTimes(1);
    const ledger = addQaza(emptyQaza(todayStr()), "Fajr", 2);
    const next = updateQaza.mock.calls[0][0](ledger);
    expect(qazaOwed(next).Fajr).toBe(1);
  });

  it("adjustQaza is a no-op for a zero delta", () => {
    const { result, updateQaza } = setup();
    updateQaza.mockClear();
    result.current.adjustQaza("Fajr", 0);
    expect(updateQaza).not.toHaveBeenCalled();
  });

  it("addQazaAll ignores non-positive counts", () => {
    const { result, updateQaza } = setup();
    updateQaza.mockClear();
    result.current.addQazaAll(0);
    result.current.addQazaAll(-3);
    expect(updateQaza).not.toHaveBeenCalled();
  });

  it("addQazaAll seeds every prayer with a positive count", () => {
    const { result, updateQaza } = setup();
    updateQaza.mockClear();
    result.current.addQazaAll(5);
    const next = updateQaza.mock.calls[0][0](emptyQaza(todayStr()));
    const owed = qazaOwed(next);
    for (const p of ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]) expect(owed[p]).toBe(5);
  });

  it("addExcused needs both endpoints", () => {
    const { result, updateQaza } = setup();
    updateQaza.mockClear();
    result.current.addExcused("", "2026-06-05", "travel");
    expect(updateQaza).not.toHaveBeenCalled();
    result.current.addExcused("2026-06-01", "2026-06-05", "travel");
    expect(updateQaza).toHaveBeenCalledTimes(1);
  });
});

describe("useQaza setQazaTarget", () => {
  it("clamps to a positive integer and writes to settings", () => {
    const { result, updateSettings } = setup();
    result.current.setQazaTarget(7);
    expect(updateSettings.mock.calls[0][0]({})).toEqual({ qazaDailyTarget: 7 });
    result.current.setQazaTarget(0);
    expect(updateSettings.mock.calls[1][0]({})).toEqual({ qazaDailyTarget: 1 });
  });
});
