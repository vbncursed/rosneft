import { describe, expect, it } from "vitest";
import type { Vec3 } from "@/entities/placement";
import { FACE_TRIANGLES, prismGeometry, ZONE_HEIGHT_M, zoneHeight, zoneOfTriangle } from "./zone-prism-geometry";

type Corners = [Vec3, Vec3, Vec3, Vec3];
const flat = (x = 0, y = 0): Corners => [
  { x, y, z: 0 },
  { x: x + 2, y, z: 0 },
  { x: x + 2, y, z: 1 },
  { x, y, z: 1 },
];

describe("zoneHeight", () => {
  it("is the fixed height in metres over the metres per scene unit", () => {
    expect(ZONE_HEIGHT_M).toBe(3);
    expect(zoneHeight(30)).toBeCloseTo(0.1, 12);
    expect(zoneHeight(1.5)).toBeCloseTo(2, 12);
  });

  it("falls back to one unit per metre when the scale is unknown", () => {
    for (const bad of [0, -2, NaN, Infinity]) expect(zoneHeight(bad)).toBe(ZONE_HEIGHT_M);
  });
});

describe("prismGeometry", () => {
  it("has eight vertices per zone: each corner at its own ground height and at that height plus H", () => {
    const corners = flat();
    corners[2] = { ...corners[2], y: 0.5 };
    const g = prismGeometry([corners], 2);
    expect(g.positions).toHaveLength(8 * 3);
    for (let i = 0; i < 4; i++) {
      expect([g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]]).toEqual([
        corners[i].x,
        corners[i].y,
        corners[i].z,
      ]);
      expect(g.positions[(i + 4) * 3 + 1]).toBeCloseTo(corners[i].y + 2, 12);
      expect(g.positions[(i + 4) * 3]).toBe(corners[i].x);
      expect(g.positions[(i + 4) * 3 + 2]).toBe(corners[i].z);
    }
  });

  it("closes the top and the four sides with ten triangles, and leaves the underside open", () => {
    const g = prismGeometry([flat()], 1);
    expect(FACE_TRIANGLES).toBe(10);
    expect(g.faces).toHaveLength(FACE_TRIANGLES * 3);
    expect([...g.faces.slice(0, 6)]).toEqual([4, 5, 6, 4, 6, 7]);
    const top = new Set(g.faces.slice(6));
    expect([...top].every((v) => v >= 0 && v < 8)).toBe(true);
    // Every side quad joins a bottom edge to the matching top edge.
    for (let i = 0; i < 4; i++) expect([...g.faces.slice(6 + i * 6, 12 + i * 6)]).toContain(i);
  });

  it("outlines the twelve edges: four below, four above and four posts", () => {
    const g = prismGeometry([flat()], 1);
    expect(g.edges).toHaveLength(24);
    const pairs = Array.from({ length: 12 }, (_, i) =>
      [g.edges[i * 2], g.edges[i * 2 + 1]].sort((a, b) => a - b).join("-"),
    );
    expect(new Set(pairs).size).toBe(12);
    expect(pairs).toContain("0-4");
    expect(pairs).toContain("4-5");
    expect(pairs).toContain("0-1");
  });

  it("offsets each further zone's indices by eight vertices, and says which zone a triangle belongs to", () => {
    const g = prismGeometry([flat(), flat(5)], 1);
    expect(g.positions).toHaveLength(16 * 3);
    expect(Math.max(...g.faces.slice(0, FACE_TRIANGLES * 3))).toBeLessThan(8);
    expect(Math.min(...g.faces.slice(FACE_TRIANGLES * 3))).toBeGreaterThanOrEqual(8);
    expect([zoneOfTriangle(0), zoneOfTriangle(9), zoneOfTriangle(10), zoneOfTriangle(19)]).toEqual([0, 0, 1, 1]);
  });

  it("is empty for no zones", () => {
    const g = prismGeometry([], 1);
    expect([g.positions.length, g.faces.length, g.edges.length]).toEqual([0, 0, 0]);
  });

  it("never produces a NaN: a corner without a usable ground height stands at zero", () => {
    const corners = flat();
    corners[1] = { ...corners[1], y: NaN };
    corners[3] = { ...corners[3], y: Infinity };
    const g = prismGeometry([corners], 1);
    expect([...g.positions].every(Number.isFinite)).toBe(true);
    expect(g.positions[1 * 3 + 1]).toBe(0);
    expect(g.positions[(1 + 4) * 3 + 1]).toBe(1);
  });
});
