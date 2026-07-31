import { describe, it, expect } from "vitest";
import { toAladhanDate, bareTime, resolveLocation, aladhanUrl, extractTimes } from "./_prayer.js";

describe("toAladhanDate", () => {
  it("reformats YYYY-MM-DD to DD-MM-YYYY", () => {
    expect(toAladhanDate("2026-08-01")).toBe("01-08-2026");
  });
  it("returns null on malformed input", () => {
    expect(toAladhanDate("2026/08/01")).toBeNull();
    expect(toAladhanDate("")).toBeNull();
    expect(toAladhanDate(undefined)).toBeNull();
  });
});

describe("bareTime", () => {
  it("strips a trailing (TZ) suffix", () => {
    expect(bareTime("05:23 (PKT)")).toBe("05:23");
    expect(bareTime("18:47 (BST)")).toBe("18:47");
  });
  it("leaves a bare time unchanged and passes non-strings through", () => {
    expect(bareTime("05:23")).toBe("05:23");
    expect(bareTime(undefined)).toBe(undefined);
  });
});

describe("resolveLocation", () => {
  it("prefers coordinates (and treats lat/lng 0 as valid)", () => {
    expect(resolveLocation({ prayerLat: 31.5, prayerLng: 74.3 }))
      .toMatchObject({ kind: "coords", lat: 31.5, lng: 74.3 });
    expect(resolveLocation({ prayerLat: 0, prayerLng: 0 }).kind).toBe("coords");
  });
  it("falls back to city/country", () => {
    expect(resolveLocation({ prayerCity: "Lahore", prayerCountry: "Pakistan" }))
      .toMatchObject({ kind: "city", city: "Lahore", country: "Pakistan" });
  });
  it("coords win over city when both present", () => {
    expect(resolveLocation({ prayerLat: 1, prayerLng: 2, prayerCity: "X", prayerCountry: "Y" }).kind)
      .toBe("coords");
  });
  it("none when no location", () => {
    expect(resolveLocation({}).kind).toBe("none");
    expect(resolveLocation(undefined).kind).toBe("none");
    expect(resolveLocation({ prayerLat: 5 }).kind).toBe("none"); // lng missing
  });
});

describe("aladhanUrl", () => {
  it("builds a coords URL with method+school", () => {
    const u = aladhanUrl({ kind: "coords", lat: 31.5, lng: 74.3 }, "01-08-2026");
    expect(u).toContain("/timings/01-08-2026?");
    expect(u).toContain("latitude=31.5");
    expect(u).toContain("longitude=74.3");
    expect(u).toContain("method=2&school=1");
  });
  it("builds a city URL, encoded", () => {
    const u = aladhanUrl({ kind: "city", city: "New York", country: "USA" }, "01-08-2026");
    expect(u).toContain("/timingsByCity/01-08-2026?");
    expect(u).toContain("city=New%20York");
    expect(u).toContain("country=USA");
  });
  it("null for none / missing date", () => {
    expect(aladhanUrl({ kind: "none" }, "01-08-2026")).toBeNull();
    expect(aladhanUrl({ kind: "coords", lat: 1, lng: 2 }, null)).toBeNull();
  });
});

describe("extractTimes", () => {
  it("picks the five fard times and strips suffixes", () => {
    expect(extractTimes({
      Fajr: "05:23 (PKT)", Sunrise: "06:40", Dhuhr: "12:10", Asr: "15:45",
      Maghrib: "18:47 (PKT)", Isha: "20:05", Midnight: "00:00",
    })).toEqual({
      Fajr: "05:23", Dhuhr: "12:10", Asr: "15:45", Maghrib: "18:47", Isha: "20:05",
    });
  });
});
