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
    expect(pickZone([hit(0, 5), hit(0, 9), hit(1, 5), hit(1, 9)], [big, twin])?.index).toBe(1);
  });

  it("does not care in what order the hits come", () => {
    expect(pickZone([hit(1, 7), hit(0, 9), hit(1, 6), hit(0, 5)], [big, small])?.index).toBe(1);
  });

  describe("a ray that crosses more than one prism along its length", () => {
    // Two prisms side by side: the ray leaves A through its back wall and only then reaches B.
    const a = { corners: rect(0, 0, 10, 10) };
    const b = { corners: rect(10, 0, 2, 2) };
    const stretch = (zone: number, enter: number, exit: number) => [hit(zone, enter), hit(zone, exit)];

    it("stays with the zone it enters first when the next one only starts where it ends", () => {
      expect(pickZone([...stretch(0, 5, 9), ...stretch(1, 9, 12)], [a, b])?.index).toBe(0);
    });

    it("does the same for a shallow ray, whose stretches are long", () => {
      expect(pickZone([...stretch(0, 5, 20), ...stretch(1, 20, 40)], [a, b])?.index).toBe(0);
    });

    it("stays with the first zone when the second is only grazed at a corner behind it", () => {
      expect(pickZone([...stretch(0, 5, 9), ...stretch(1, 9.2, 9.2000001)], [a, b])?.index).toBe(0);
    });

    it("picks the inner zone when its stretch lies within the outer one's", () => {
      const inner = { corners: rect(4, 4, 1, 1) };
      expect(pickZone([...stretch(0, 5, 9), ...stretch(1, 6, 7)], [a, inner])?.index).toBe(1);
    });

    it("picks the smaller of two that really overlap along the ray", () => {
      expect(pickZone([...stretch(0, 5, 9), ...stretch(1, 8, 12)], [a, b])?.index).toBe(1);
    });

    it("takes the later of two coincident zones", () => {
      const twin = { corners: rect(0, 0, 10, 10) };
      expect(pickZone([...stretch(0, 5, 9), ...stretch(1, 5, 9)], [a, twin])?.index).toBe(1);
    });
  });

  describe("a zone with no area", () => {
    const flat = { corners: [0, 1, 2, 3].map((x) => ({ x, y: 0, z: 0 })) as Corners };
    const wide = { corners: rect(0, 0, 10, 10) };

    it("never wins over a real zone it overlaps", () => {
      expect(pickZone([hit(0, 5), hit(0, 9), hit(1, 6), hit(1, 7)], [wide, flat])?.index).toBe(0);
    });

    it("is not pickable on its own: a collinear zone has no footprint to click", () => {
      expect(pickZone([hit(0, 5), hit(0, 9)], [flat])).toBeNull();
    });
  });
});
