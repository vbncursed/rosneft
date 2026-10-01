import { describe, expect, it } from "vitest";
import { DEFAULT_LIMIT, isHash, isLimit, isSlug, isUserId, LIMITS } from "./validate";

describe("validate", () => {
  it("accepts a sha256 hex and nothing else", () => {
    expect(isHash("a".repeat(64))).toBe(true);
    expect(isHash("A".repeat(64))).toBe(false);
    expect(isHash("a".repeat(63))).toBe(false);
    expect(isHash(`../${"a".repeat(61)}`)).toBe(false);
  });
  it("accepts gateway slugs and refuses anything path-like", () => {
    expect(isSlug("ust-kut-2")).toBe(true);
    for (const bad of ["", "-a", "A", "a/b", "..", "a.b", "a".repeat(129), 7]) expect(isSlug(bad)).toBe(false);
  });
  it("accepts a UUID user id only", () => {
    expect(isUserId("0b5e8a3c-1f2d-4c5b-9a7e-3d2c1b0a9f8e")).toBe(true);
    expect(isUserId("../../etc")).toBe(false);
    expect(isUserId(null)).toBe(false);
  });
  it("offers four limits, ten gibibytes by default", () => {
    expect(LIMITS).toEqual([5, 10, 20, 50].map((g) => g * 1024 ** 3));
    expect(DEFAULT_LIMIT).toBe(10 * 1024 ** 3);
    expect(isLimit(DEFAULT_LIMIT)).toBe(true);
    expect(isLimit(1)).toBe(false);
    expect(isLimit("10")).toBe(false);
  });
});
