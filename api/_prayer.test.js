import { describe, it, expect } from "vitest";
import { toAladhanDate, bareTime, resolveLocation, aladhanUrl, extractTimes, isFridayYMD, prayerDisplayName, methodSchoolParam, DEFAULT_METHOD_SCHOOL } from "./_prayer.js";

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
  it("defaults to ISNA/Hanafi when no method/school is passed", () => {
    const u = aladhanUrl({ kind: "coords", lat: 1, lng: 2 }, "01-08-2026");
    expect(u).toContain(DEFAULT_METHOD_SCHOOL);
    expect(u).toContain("method=2&school=1");
  });
  it("honours a passed method/school fragment", () => {
    const u = aladhanUrl({ kind: "city", city: "Cairo", country: "Egypt" }, "01-08-2026", "method=5&school=0");
    expect(u).toContain("method=5&school=0");
    expect(u).not.toContain("method=2&school=1");
  });
  it("null for none / missing date", () => {
    expect(aladhanUrl({ kind: "none" }, "01-08-2026")).toBeNull();
    expect(aladhanUrl({ kind: "coords", lat: 1, lng: 2 }, null)).toBeNull();
  });
});

describe("methodSchoolParam (server — must mirror src/lib/prayerConfig)", () => {
  it("builds the fragment for valid input", () => {
    expect(methodSchoolParam(3, 0)).toBe("method=3&school=0");
    expect(methodSchoolParam(2, 1)).toBe("method=2&school=1");
  });
  it("falls back to ISNA/Hanafi for missing or unknown values", () => {
    expect(methodSchoolParam(undefined, undefined)).toBe("method=2&school=1");
    expect(methodSchoolParam(999, 7)).toBe("method=2&school=1");
    expect(methodSchoolParam(null, null)).toBe("method=2&school=1"); // Number(null)===0 guard
  });
  it("DEFAULT_METHOD_SCHOOL is the ISNA/Hanafi fragment", () => {
    expect(DEFAULT_METHOD_SCHOOL).toBe("method=2&school=1");
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

describe("isFridayYMD / prayerDisplayName", () => {
  it("detects Friday (2026-08-07) tz-independently", () => {
    expect(isFridayYMD("2026-08-07")).toBe(true);
    expect(isFridayYMD("2026-08-06")).toBe(false);
    expect(isFridayYMD("bad")).toBe(false);
  });
  it("relabels only Friday Dhuhr as Jumu'ah", () => {
    expect(prayerDisplayName("Dhuhr", "2026-08-07")).toBe("Jumu'ah");
    expect(prayerDisplayName("Dhuhr", "2026-08-06")).toBe("Dhuhr");
    expect(prayerDisplayName("Fajr", "2026-08-07")).toBe("Fajr");
  });
});
