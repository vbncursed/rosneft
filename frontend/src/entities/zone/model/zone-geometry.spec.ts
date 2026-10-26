import { describe, expect, it } from "vitest";
import { placementsInside, zoneAxis, zoneCentre, zoneContains, zoneSizeM } from "./zone-geometry";
import type { Zone } from "./zone";

const quad = (pts: [number, number][], y = 0): Zone["corners"] => pts.map(([x, z]) => ({ x, y, z })) as Zone["corners"];

const zone = (corners: Zone["corners"]): Zone => ({
  id: 1,
  title: "Z",
  corners,
  tags: [],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
});

// 4 wide (x) by 2 deep (z), centred on the origin.
const FLAT = zone(
  quad([
    [-2, -1],
    [2, -1],
    [2, 1],
    [-2, 1],
  ]),
);
// The same rectangle turned 45 degrees.
const s = Math.SQRT1_2;
const TURNED = zone(
  quad([
    [-2 * s + s, -2 * s - s],
    [2 * s + s, 2 * s - s],
    [2 * s - s, 2 * s + s],
    [-2 * s - s, -2 * s + s],
  ]),
);

describe("zoneContains", () => {
  it("is true inside an axis-aligned rectangle", () => expect(zoneContains(FLAT, { x: 1, z: 0.5 })).toBe(true));
  it("is false outside it", () => expect(zoneContains(FLAT, { x: 3, z: 0 })).toBe(false));
  it("counts a point on an edge as inside", () => expect(zoneContains(FLAT, { x: 2, z: 0 })).toBe(true));
  it("handles a rotated rectangle: inside the diagonal, outside the bounding-box corner", () => {
    expect(zoneContains(TURNED, { x: 0, z: 0 })).toBe(true);
    expect(zoneContains(TURNED, { x: 2.5, z: -2.5 })).toBe(false);
  });
  it("accepts either winding", () => {
    const reversed = zone([...FLAT.corners].reverse() as Zone["corners"]);
    expect(zoneContains(reversed, { x: 0, z: 0 })).toBe(true);
  });
});

describe("zoneCentre", () => {
  it("is the mean of the corners, height included", () => {
    expect(
      zoneCentre(
        zone(
          quad(
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
            ],
            3,
          ),
        ),
      ),
    ).toEqual({ x: 1, y: 3, z: 1 });
  });
});

describe("zoneAxis", () => {
  it("is 0 when the long side runs along x", () => expect(zoneAxis(FLAT)).toBeCloseTo(0));
  it("picks the long side even when it is the second edge", () => {
    const tall = zone(
      quad([
        [-1, -2],
        [1, -2],
        [1, 2],
        [-1, 2],
      ]),
    );
    expect(Math.abs(zoneAxis(tall))).toBeCloseTo(Math.PI / 2);
    expect(zoneAxis(tall)).toBeGreaterThan(0);
  });
  it("is a three.js yaw: rotating (1,0,0) by it points along the long side", () => {
    const yaw = zoneAxis(TURNED);
    const dir = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    expect(Math.abs(dir.x * s + dir.z * s)).toBeCloseTo(1);
  });
  it("stays in (-pi/2, pi/2]", () => {
    const back = zone(
      quad([
        [2, 1],
        [-2, 1],
        [-2, -1],
        [2, -1],
      ]),
    );
    expect(zoneAxis(back)).toBeGreaterThan(-Math.PI / 2);
    expect(zoneAxis(back)).toBeLessThanOrEqual(Math.PI / 2);
    expect(zoneAxis(back)).toBeCloseTo(0);
  });
});

describe("zoneSizeM", () => {
  it("scales the sides by the unit ratio", () => expect(zoneSizeM(FLAT, 2.5)).toEqual({ width: 10, height: 5 }));
});

describe("placementsInside", () => {
  it("counts only visible placements inside", () => {
    const at = (x: number, hidden = false) => ({ position: { x, y: 0, z: 0 }, hidden });
    expect(placementsInside(FLAT, [at(0), at(1, true), at(9)])).toBe(1);
  });
});
