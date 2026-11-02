import { describe, expect, it } from "vitest";
import { applyFit } from "@/entities/site-plan";
import type { Zone } from "@/entities/zone";
import { planZones, unapplyFit } from "./plan-zones";

const FIT = { scale: 0.02, rotation: 0.3, tx: 5, tz: -7 };
const at = (x: number, z: number) => ({ x, y: 0, z });
const zone = (id: number, title: string, c: [number, number][]): Zone => ({
  id,
  title,
  corners: c.map(([x, z]) => at(x, z)) as Zone["corners"],
  tags: [],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "t",
  updatedAt: "t",
});

describe("unapplyFit", () => {
  it("is the inverse of applyFit", () => {
    const p = { x: 812.5, y: 301.25 };
    const back = unapplyFit(FIT, applyFit(FIT, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
});

describe("planZones", () => {
  const z = zone(1, "Tanks", [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);

  it("draws each zone back on the page through the fit", () => {
    const [out] = planZones([z], FIT);
    expect(out).toMatchObject({ id: 1, title: "Tanks" });
    expect(out.corners).toHaveLength(4);
    const m = applyFit(FIT, out.corners[2]);
    expect(m.x).toBeCloseTo(1, 9);
    expect(m.z).toBeCloseTo(1, 9);
  });

  it("draws nothing without a usable fit", () => {
    expect(planZones([z], null)).toEqual([]);
  });
});
