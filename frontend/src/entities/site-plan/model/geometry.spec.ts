import { describe, expect, it } from "vitest";

import { apply, boxAt, convexHull, dist, fromUv, minAreaBox, mul } from "./geometry";

describe("matrices", () => {
  it("mul applies the right-hand matrix first", () => {
    const scale = [2, 0, 0, 2, 0, 0];
    const shift = [1, 0, 0, 1, 5, 0];
    expect(apply(mul(shift, scale), 1, 1)).toEqual({ x: 7, y: 2 });
    expect(apply(mul(scale, shift), 1, 1)).toEqual({ x: 12, y: 2 });
  });

  it("dist is Euclidean", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("boxes", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 0, y: 2 },
    { x: 2, y: 1 },
  ];

  it("convexHull drops interior points", () => {
    expect(convexHull(square)).toHaveLength(4);
    expect(convexHull(square.slice(0, 2))).toHaveLength(2);
  });

  it("minAreaBox finds the tilted rectangle's own axes", () => {
    const a = 0.4;
    const pts = square.map((p) => fromUv(a, p.x, p.y));
    const box = minAreaBox(pts);
    expect((box.u1 - box.u0) * (box.v1 - box.v0)).toBeCloseTo(8, 9);
    expect(box.angle).toBeCloseTo(a, 9);
  });

  it("boxAt measures extents in a rotated frame", () => {
    const box = boxAt(square, 0);
    expect([box.u0, box.u1, box.v0, box.v1]).toEqual([0, 4, 0, 2]);
  });

  it("minAreaBox of nothing is empty rather than a throw", () => {
    expect(minAreaBox([]).angle).toBe(0);
  });
});
