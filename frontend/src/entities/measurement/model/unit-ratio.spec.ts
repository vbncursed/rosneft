import { describe, expect, it } from "vitest";
import { computeUnitRatio } from "./unit-ratio";

describe("computeUnitRatio", () => {
  it("is the largest bbox axis over 2 (converter's normalised max)", () => {
    expect(computeUnitRatio({ x: 4, y: 2, z: 1 })).toBe(2);
    expect(computeUnitRatio({ x: 1, y: 2, z: 6 })).toBe(3);
  });

  it("falls back to 1 when the bbox is degenerate", () => {
    expect(computeUnitRatio({ x: 0, y: 0, z: 0 })).toBe(1); // max <= 0
    expect(computeUnitRatio({ x: -5, y: -2, z: -1 })).toBe(1); // all negative
    expect(computeUnitRatio({ x: Infinity, y: 1, z: 1 })).toBe(1); // not finite
  });
});
