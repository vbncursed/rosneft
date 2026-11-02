import { describe, expect, it } from "vitest";

import { autoPairs, type CalibrationPair } from "./auto-pairs";
import type { ControlPoint } from "./control-points";

// 200 m square footprint centred on E 500000, N 0 (see utm-to-scene.spec).
const BBOX = { min: { x: 499900, y: -50, z: -100 }, max: { x: 500100, y: 50, z: 100 } };
const cp = (label: string, e: number, n: number): ControlPoint => ({ label, at: { x: e - 499000, y: 100 - n }, e, n });

describe("autoPairs", () => {
  const inside = [cp("A", 500000, 0), cp("B", 500050, 50)];

  it("proposes one pair per control point inside the bbox", () => {
    const pairs = autoPairs(inside, BBOX, () => 3, 0);
    expect(pairs).toHaveLength(2);
    expect(pairs[1]).toMatchObject({ pdf: inside[1].at, utm: { e: 500050, n: 50 } });
    expect(pairs[1].scene.x).toBeCloseTo(0.5, 12);
    expect(pairs[1].scene.z).toBeCloseTo(-0.5, 12);
    expect(pairs[1].scene.y).toBe(3);
  });

  it("proposes nothing with fewer than two points inside the bbox", () => {
    expect(autoPairs([inside[0], cp("far", 600000, 0)], BBOX, () => 0, 0)).toEqual([]);
    expect(autoPairs([], BBOX, () => 0, 0)).toEqual([]);
  });

  it("uses the fallback height where the probe misses", () => {
    const pairs: CalibrationPair[] = autoPairs(inside, BBOX, () => null, 0.25);
    expect(pairs.map((p) => p.scene.y)).toEqual([0.25, 0.25]);
  });
});
