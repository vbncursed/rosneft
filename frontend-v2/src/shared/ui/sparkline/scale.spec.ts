import { describe, expect, it } from "vitest";
import { toBars } from "./scale";

describe("toBars", () => {
  it("scales every bar against the tallest", () => {
    expect(toBars([25, 50, 100]).map((b) => b.heightPct)).toEqual([25, 50, 100]);
  });

  it("marks the tallest bar as the peak, and only it", () => {
    expect(toBars([12, 52, 41]).map((b) => b.peak)).toEqual([false, true, false]);
  });

  it("marks only the first of a tied maximum, so exactly one bar is accented", () => {
    const bars = toBars([9, 9, 4]);
    expect(bars.filter((b) => b.peak)).toHaveLength(1);
    expect(bars[0].peak).toBe(true);
  });

  it("draws a flat floor for an all-zero series rather than dividing by zero", () => {
    const bars = toBars([0, 0, 0]);
    expect(bars.every((b) => b.heightPct === 0)).toBe(true);
    expect(bars.some((b) => b.peak)).toBe(false);
  });

  it("dims the buckets still filling in", () => {
    expect(toBars([1, 2, 3, 4], 2).map((b) => b.provisional)).toEqual([false, false, true, true]);
  });

  it("treats every bucket as final when no cutoff is given", () => {
    expect(toBars([1, 2, 3]).every((b) => !b.provisional)).toBe(true);
  });

  it("keeps the original values for the accessible summary", () => {
    expect(toBars([4, 7]).map((b) => b.value)).toEqual([4, 7]);
  });

  it("returns nothing for an empty series", () => {
    expect(toBars([])).toEqual([]);
  });
});
