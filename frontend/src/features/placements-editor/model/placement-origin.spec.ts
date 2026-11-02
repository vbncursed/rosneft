import { describe, expect, it } from "vitest";
import { rowPosition, sameOrigin } from "./placement-origin";

const O = { position: { x: 10, y: 2, z: -4 }, yaw: Math.PI / 2 };

describe("sameOrigin", () => {
  it("compares by value, and null only equals null", () => {
    expect(sameOrigin(null, null)).toBe(true);
    expect(sameOrigin(O, { ...O, position: { ...O.position } })).toBe(true);
    expect(sameOrigin(O, null)).toBe(false);
    expect(sameOrigin(O, { ...O, yaw: 0 })).toBe(false);
    expect(sameOrigin(O, { ...O, position: { ...O.position, z: 0 } })).toBe(false);
  });
});

describe("rowPosition", () => {
  it("runs along +x from the scene origin without an origin", () => {
    expect(rowPosition(2, 0.5, null)).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("runs along the origin's axis from the origin: a quarter turn sends +x to -z", () => {
    const p = rowPosition(2, 0.5, O);
    expect(p.x).toBeCloseTo(10, 10);
    expect(p.y).toBe(2);
    expect(p.z).toBeCloseTo(-5, 10);
  });
});
