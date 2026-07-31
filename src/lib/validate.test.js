import { describe, it, expect } from "vitest";
import { asArray, asObject } from "./validate";

describe("asArray", () => {
  it("passes arrays through by reference", () => {
    const a = [1, 2];
    expect(asArray(a)).toBe(a);
  });
  it("coerces non-arrays to []", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray({ 0: "x" })).toEqual([]);
    expect(asArray("nope")).toEqual([]);
    expect(asArray(42)).toEqual([]);
  });
});

describe("asObject", () => {
  it("passes plain objects through by reference", () => {
    const o = { a: 1 };
    expect(asObject(o)).toBe(o);
  });
  it("rejects arrays (a map field must not be read as an array)", () => {
    expect(asObject([1, 2])).toEqual({});
  });
  it("coerces null/primitives to {}", () => {
    expect(asObject(null)).toEqual({});
    expect(asObject(undefined)).toEqual({});
    expect(asObject("nope")).toEqual({});
    expect(asObject(0)).toEqual({});
  });
});
