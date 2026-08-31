import { describe, it, expect } from "vitest";
import {
  normalizeJamaahTime, toMinutes, effectivePrayerTime, nextPrayerNudge, FARD,
} from "./jamaah";

const TIMES = { Fajr: "05:00", Dhuhr: "12:10", Asr: "15:45", Maghrib: "18:47", Isha: "20:05" };
const at = (iso) => new Date(iso); // TZ=UTC in tests, so getHours() == UTC hour

describe("normalizeJamaahTime", () => {
  it("zero-pads and accepts valid HH:MM", () => {
    expect(normalizeJamaahTime("5:30")).toBe("05:30");
    expect(normalizeJamaahTime("05:30")).toBe("05:30");
    expect(normalizeJamaahTime("13:45")).toBe("13:45");
  });
  it("rejects empty / out-of-range / junk", () => {
    expect(normalizeJamaahTime("")).toBeNull();
    expect(normalizeJamaahTime(null)).toBeNull();
    expect(normalizeJamaahTime(undefined)).toBeNull();
    expect(normalizeJamaahTime("25:00")).toBeNull();
    expect(normalizeJamaahTime("5:60")).toBeNull();
    expect(normalizeJamaahTime("abc")).toBeNull();
  });
});

describe("toMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(toMinutes("05:30")).toBe(330);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("bad")).toBeNull();
  });
});

describe("effectivePrayerTime", () => {
  it("uses the jamā'ah time when set", () => {
    expect(effectivePrayerTime("Fajr", TIMES, { Fajr: "05:30" })).toBe("05:30");
  });
  it("falls back to the Aladhan start (stripping a TZ suffix)", () => {
    expect(effectivePrayerTime("Fajr", { Fajr: "05:00 (PKT)" }, {})).toBe("05:00");
    expect(effectivePrayerTime("Dhuhr", TIMES, {})).toBe("12:10");
  });
  it("ignores an invalid jamā'ah value and falls back to start", () => {
    expect(effectivePrayerTime("Asr", TIMES, { Asr: "nope" })).toBe("15:45");
  });
  it("is null when neither is available", () => {
    expect(effectivePrayerTime("Isha", {}, {})).toBeNull();
  });
});

describe("nextPrayerNudge", () => {
  it("returns the next upcoming fard and minutes until it", () => {
    const n = nextPrayerNudge({ prayerTimes: TIMES, jamaahTimes: {}, now: at("2026-08-31T12:00:00Z") });
    expect(n).toMatchObject({ name: "Dhuhr", time: "12:10", minsUntil: 10, isJamaah: false });
  });

  it("counts down to the jamā'ah time when one is set", () => {
    const n = nextPrayerNudge({
      prayerTimes: TIMES,
      jamaahTimes: { Dhuhr: "13:30" },
      now: at("2026-08-31T12:00:00Z"),
    });
    expect(n).toMatchObject({ name: "Dhuhr", time: "13:30", minsUntil: 90, isJamaah: true });
  });

  it("skips a prayer already prayed", () => {
    const n = nextPrayerNudge({
      prayerTimes: TIMES,
      jamaahTimes: {},
      now: at("2026-08-31T12:00:00Z"),
      isDone: (p) => p === "Dhuhr",
    });
    expect(n.name).toBe("Asr");
    expect(n.minsUntil).toBe(15 * 60 + 45 - (12 * 60)); // 225
  });

  it("returns null once all of today's fard are past", () => {
    expect(nextPrayerNudge({ prayerTimes: TIMES, jamaahTimes: {}, now: at("2026-08-31T21:00:00Z") }))
      .toBeNull();
  });

  it("returns null without prayer times", () => {
    expect(nextPrayerNudge({ prayerTimes: null, jamaahTimes: {}, now: at("2026-08-31T12:00:00Z") }))
      .toBeNull();
  });

  it("does not nudge for a prayer whose window is in the past even if jamā'ah is set later", () => {
    // now just after Dhuhr start but before its jamā'ah — jamā'ah is still ahead.
    const n = nextPrayerNudge({
      prayerTimes: TIMES,
      jamaahTimes: { Dhuhr: "12:30" },
      now: at("2026-08-31T12:15:00Z"),
    });
    expect(n).toMatchObject({ name: "Dhuhr", minsUntil: 15 });
  });
});

describe("FARD", () => {
  it("is the five obligatory prayers in order", () => {
    expect(FARD).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  });
});
