import { describe, expect, it } from "vitest";
import plan from "@/entities/site-plan/model/__data__/mr1-plan.json";
import { applyFit, detectRects, extractPaths, MIN_SIDE_PT_UNSCALED, zoneFromRect } from "@/entities/site-plan";
import type { Zone } from "@/entities/zone";
import { previewOutlines } from "./preview-outlines";

const RECTS = detectRects(extractPaths(plan.opList, plan.ops, plan.viewport), plan.page, MIN_SIDE_PT_UNSCALED);
const FIT = { scale: 0.002, rotation: 0.3, tx: 0.1, tz: -0.4 };
const base = { rects: RECTS, fit: FIT, groundAt: () => 1, fallbackY: 7, zones: [] as Zone[], unitRatio: 50 };

const zoneOf = (corners: Zone["corners"]): Zone => ({
  id: 1,
  title: "z",
  corners,
  tags: [],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
});

describe("previewOutlines", () => {
  it("maps every MR1 rectangle through the fit, indexed as the editor lists it", () => {
    const out = previewOutlines(base);
    expect(out).toHaveLength(RECTS.length);
    expect(RECTS.length).toBeGreaterThan(20);
    out.forEach((o, i) => {
      expect(o.index).toBe(i);
      o.corners.forEach((c, k) => {
        const xz = applyFit(FIT, RECTS[i].corners[k]);
        expect(c).toEqual({ x: xz.x, y: 1, z: xz.z });
      });
    });
  });

  it("lands on the ground exactly as zoneFromRect does", () => {
    const groundAt = (x: number, z: number) => x - z;
    const [first] = previewOutlines({ ...base, groundAt });
    const body = zoneFromRect({ rect: RECTS[0], fit: FIT, groundAt, fallbackY: 7, metresPerPt: null });
    expect(first.corners).toEqual(body.corners);
  });

  it("falls back to the median height where the probe misses, never NaN", () => {
    const out = previewOutlines({ ...base, groundAt: () => null });
    for (const o of out) for (const c of o.corners) expect(c.y).toBe(7);
    expect(out.flatMap((o) => o.corners).every((c) => [c.x, c.y, c.z].every(Number.isFinite))).toBe(true);
  });

  it("leaves out a rectangle that already is a zone, even listed from another corner or off by a few centimetres", () => {
    const saved = zoneFromRect({ rect: RECTS[3], fit: FIT, groundAt: () => 1, fallbackY: 7, metresPerPt: null });
    const [a, b, c, d] = saved.corners;
    const nudged = [b, c, d, a].map((p) => ({ ...p, x: p.x + 0.04 / 50 }));
    const out = previewOutlines({ ...base, zones: [zoneOf(nudged as Zone["corners"])] });
    expect(out.map((o) => o.index)).not.toContain(3);
    expect(out).toHaveLength(RECTS.length - 1);
  });

  it("keeps a rectangle whose zone has moved by more than half a metre", () => {
    const saved = zoneFromRect({ rect: RECTS[3], fit: FIT, groundAt: () => 1, fallbackY: 7, metresPerPt: null });
    const moved = saved.corners.map((p) => ({ ...p, x: p.x + 2 / 50 }));
    const out = previewOutlines({ ...base, zones: [zoneOf(moved as Zone["corners"])] });
    expect(out).toHaveLength(RECTS.length);
  });

  it("draws nothing without rectangles", () => {
    expect(previewOutlines({ ...base, rects: [] })).toEqual([]);
  });
});
