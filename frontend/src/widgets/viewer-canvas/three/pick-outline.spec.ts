import { describe, expect, it } from "vitest";
import type { PreviewOutline } from "@/features/zone-editor";
import { pickOutline } from "./pick-outline";

const box = (index: number, x0: number, z0: number, x1: number, z1: number): PreviewOutline => ({
  index,
  corners: [
    { x: x0, y: 1, z: z0 },
    { x: x1, y: 1, z: z0 },
    { x: x1, y: 1, z: z1 },
    { x: x0, y: 1, z: z1 },
  ],
});
const OUTER = box(2, 0, 0, 10, 10);
const INNER = box(5, 4, 4, 6, 6);

describe("pickOutline", () => {
  it("picks the inner rectangle inside it and the outer one elsewhere, whatever the list order", () => {
    for (const list of [
      [OUTER, INNER],
      [INNER, OUTER],
    ]) {
      expect(pickOutline(list, { x: 5, z: 5 })).toBe(5);
      expect(pickOutline(list, { x: 1, z: 9 })).toBe(2);
    }
  });

  it("takes the later index of two coincident rectangles, as the plan window's later button wins", () => {
    expect(pickOutline([box(7, 0, 0, 2, 2), box(3, 0, 0, 2, 2)], { x: 1, z: 1 })).toBe(7);
  });

  it("counts a point on an edge as inside", () => {
    expect(pickOutline([OUTER, INNER], { x: 4, z: 5 })).toBe(5);
    expect(pickOutline([OUTER], { x: 0, z: 0 })).toBe(2);
  });

  it("reads a rotated rectangle of either winding", () => {
    const diamond: PreviewOutline = {
      index: 1,
      corners: [
        { x: 5, y: 0, z: 0 },
        { x: 10, y: 0, z: 5 },
        { x: 5, y: 0, z: 10 },
        { x: 0, y: 0, z: 5 },
      ],
    };
    const reversed = { ...diamond, corners: [...diamond.corners].reverse() as PreviewOutline["corners"] };
    for (const d of [diamond, reversed]) {
      expect(pickOutline([d], { x: 5, z: 5 })).toBe(1);
      expect(pickOutline([d], { x: 0.5, z: 0.5 })).toBeNull();
    }
  });

  it("is null outside every rectangle", () => {
    expect(pickOutline([OUTER, INNER], { x: 11, z: 5 })).toBeNull();
    expect(pickOutline([], { x: 0, z: 0 })).toBeNull();
  });
});
