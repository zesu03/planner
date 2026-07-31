import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  emptyMuhasabaEntry, isMuhasabaFilled, canGenerateMirror,
  muhasabaStreak, RELATION_OPTIONS,
} from "./muhasaba";
import { todayStr, addDaysToStr } from "./dates";

describe("emptyMuhasabaEntry", () => {
  it("is a blank entry (isMuhasabaFilled false)", () => {
    expect(isMuhasabaFilled(emptyMuhasabaEntry())).toBe(false);
  });
  it("has the expected pillar fields", () => {
    const e = emptyMuhasabaEntry();
    expect(e.shukr).toEqual(["", "", ""]);
    expect(e.tawbah).toEqual({ stopped: false, resolved: false, restored: false });
    expect(e.duaCheck).toEqual({ status: null, note: "" });
  });
});

describe("isMuhasabaFilled", () => {
  it("false for null / blank", () => {
    expect(isMuhasabaFilled(null)).toBe(false);
    expect(isMuhasabaFilled(emptyMuhasabaEntry())).toBe(false);
  });
  it("true when any signal is present", () => {
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), quranPages: "3" })).toBe(true);
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), dhikr: true })).toBe(true);
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), sinTags: ["Anger"] })).toBe(true);
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), shukr: ["", "alhamdulillah", ""] })).toBe(true);
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), niyyahRating: 3 })).toBe(true);
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), tawbah: { stopped: true, resolved: false, restored: false } })).toBe(true);
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), relations: { parents: "call" } })).toBe(true);
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), goalChecks: { g1: "yes" } })).toBe(true);
  });
  it("blank shukr entries do not count", () => {
    expect(isMuhasabaFilled({ ...emptyMuhasabaEntry(), shukr: ["", "  ", ""] })).toBe(false);
  });
});

describe("canGenerateMirror", () => {
  const day = "2026-06-15";
  it("true when the muhasaba entry is filled", () => {
    expect(canGenerateMirror({ ...emptyMuhasabaEntry(), dhikr: true }, day, {}, [])).toBe(true);
  });
  it("true when any of the five prayers is logged that day", () => {
    expect(canGenerateMirror(null, day, { Asr: [day] }, [])).toBe(true);
  });
  it("true when any focus minutes are logged that day", () => {
    expect(canGenerateMirror(null, day, {}, [{ day, mins: 25 }])).toBe(true);
  });
  it("false with no signal at all", () => {
    expect(canGenerateMirror(null, day, {}, [])).toBe(false);
    expect(canGenerateMirror(emptyMuhasabaEntry(), day, { Asr: ["2026-06-14"] }, [{ day: "2026-06-14", mins: 25 }])).toBe(false);
  });
});

describe("muhasabaStreak", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  const filled = () => ({ ...emptyMuhasabaEntry(), dhikr: true });

  it("counts consecutive filled days back from today", () => {
    const m = {
      [todayStr()]: filled(),
      [addDaysToStr(todayStr(), -1)]: filled(),
      [addDaysToStr(todayStr(), -2)]: filled(),
    };
    expect(muhasabaStreak(m)).toBe(3);
  });
  it("today blank does not break the streak", () => {
    const m = { [addDaysToStr(todayStr(), -1)]: filled() };
    expect(muhasabaStreak(m)).toBe(1);
  });
  it("a gap breaks it", () => {
    const m = { [todayStr()]: filled(), [addDaysToStr(todayStr(), -2)]: filled() };
    expect(muhasabaStreak(m)).toBe(1);
  });
  it("empty → 0", () => {
    expect(muhasabaStreak({})).toBe(0);
  });
});

describe("RELATION_OPTIONS", () => {
  it("leads with Allah and uses stable lowercase slugs", () => {
    expect(RELATION_OPTIONS[0]).toEqual({ slug: "allah", label: "Allah" });
    for (const r of RELATION_OPTIONS) expect(r.slug).toBe(r.slug.toLowerCase());
  });
});
