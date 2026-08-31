import { describe, it, expect } from "vitest";
import {
  CALC_METHODS, ASR_SCHOOLS, DEFAULT_METHOD, DEFAULT_SCHOOL,
  normalizeMethod, normalizeSchool, methodSchoolParam, methodName,
} from "./prayerConfig";

describe("prayerConfig defaults", () => {
  it("defaults to ISNA + Hanafi (preserving prior behaviour)", () => {
    expect(DEFAULT_METHOD).toBe(2);
    expect(DEFAULT_SCHOOL).toBe(1);
    expect(methodSchoolParam(DEFAULT_METHOD, DEFAULT_SCHOOL)).toBe("method=2&school=1");
  });
});

describe("normalizeMethod", () => {
  it("accepts offered ids and coerces numeric strings", () => {
    expect(normalizeMethod(3)).toBe(3);
    expect(normalizeMethod("5")).toBe(5);
  });
  it("falls back to the default for unknown / missing / junk", () => {
    expect(normalizeMethod(999)).toBe(2);
    expect(normalizeMethod(null)).toBe(2);
    expect(normalizeMethod(undefined)).toBe(2);
    expect(normalizeMethod("abc")).toBe(2);
  });
});

describe("normalizeSchool", () => {
  it("accepts only 0 or 1", () => {
    expect(normalizeSchool(0)).toBe(0);
    expect(normalizeSchool(1)).toBe(1);
    expect(normalizeSchool("0")).toBe(0);
  });
  it("falls back to Hanafi for anything else", () => {
    expect(normalizeSchool(2)).toBe(1);
    expect(normalizeSchool(null)).toBe(1);
    expect(normalizeSchool(undefined)).toBe(1);
  });
});

describe("methodSchoolParam", () => {
  it("builds the query fragment from valid input", () => {
    expect(methodSchoolParam(3, 0)).toBe("method=3&school=0");
    expect(methodSchoolParam(4, 1)).toBe("method=4&school=1");
  });
  it("never emits a broken query for corrupt input", () => {
    expect(methodSchoolParam(999, 7)).toBe("method=2&school=1");
    expect(methodSchoolParam(undefined, undefined)).toBe("method=2&school=1");
    // null must fall back, not become method 0 / school 0 (Number(null) === 0)
    expect(methodSchoolParam(null, null)).toBe("method=2&school=1");
  });
});

describe("method / school option lists", () => {
  it("offers ISNA and has unique method ids", () => {
    const ids = CALC_METHODS.map((m) => m.id);
    expect(ids).toContain(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CALC_METHODS.every((m) => typeof m.name === "string" && m.name.length > 0)).toBe(true);
  });
  it("offers exactly the two Asr schools", () => {
    expect(ASR_SCHOOLS.map((s) => s.id)).toEqual([0, 1]);
  });
  it("methodName resolves a friendly label (default for unknown)", () => {
    expect(methodName(2)).toMatch(/ISNA/);
    expect(methodName(999)).toMatch(/ISNA/); // normalizes to the default
  });
});
