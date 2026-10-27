import { describe, expect, it } from "vitest";
import type { Vec3 } from "@/entities/placement";
import { FACE_TRIANGLES } from "./zone-prism-geometry";
import { footprintArea, pickZone } from "./zone-pick";

type Corners = [Vec3, Vec3, Vec3, Vec3];
const rect = (x: number, z: number, w: number, d: number): Corners => [
  { x, y: 0, z },
  { x: x + w, y: 0, z },
  { x: x + w, y: 0, z: z + d },
  { x, y: 0, z: z + d },
];
// A hit on zone `i`: a triangle of its ten, at a distance.
const hit = (zone: number, distance: number, k = 0) => ({ faceIndex: zone * FACE_TRIANGLES + k, distance });

describe("footprintArea", () => {
  it("is the rectangle's area, whichever way it winds", () => {
    expect(footprintArea(rect(0, 0, 2, 3))).toBeCloseTo(6, 12);
    expect(footprintArea([...rect(0, 0, 2, 3)].reverse() as Corners)).toBeCloseTo(6, 12);
  });
});

describe("pickZone", () => {
  const big = { corners: rect(0, 0, 10, 10) };
  const small = { corners: rect(4, 4, 1, 1) };

  it("finds nothing when the ray crosses no prism", () => {
    expect(pickZone([], [big, small])).toBeNull();
  });

  it("picks the small zone nested in a big one when the ray crosses both", () => {
    const picked = pickZone([hit(0, 5), hit(1, 6), hit(1, 7), hit(0, 9)], [big, small]);
    expect(picked?.index).toBe(1);
    // Its exit is its own far wall, not the big one's.
    expect(picked?.exit).toBe(7);
  });

  it("picks the big zone when the ray crosses only its wall", () => {
    const picked = pickZone([hit(0, 5), hit(0, 9)], [big, small]);
    expect(picked).toEqual({ index: 0, exit: 9 });
  });

  it("takes the later zone of two with the same footprint", () => {
    const twin = { corners: rect(0, 0, 10, 10) };
    expect(pickZone([hit(0, 5), hit(1, 5)], [big, twin])?.index).toBe(1);
  });

  it("does not care in what order the hits come", () => {
    expect(pickZone([hit(1, 7), hit(0, 9), hit(1, 6), hit(0, 5)], [big, small])?.index).toBe(1);
  });
});
