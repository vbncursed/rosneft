import { describe, expect, it } from "vitest";

import type { PlanRect } from "./detect-rects";
import { applyFit } from "./fit-similarity";
import { zoneFromRect } from "./zone-from-rect";

const PT_PER_M = 6.6;
const fit = { scale: 0.002, rotation: 0.3, tx: 0.1, tz: -0.4 };
const [w, h] = [7.5 * PT_PER_M, 13.0 * PT_PER_M];
const rect: PlanRect = {
  corners: [
    { x: 100, y: 200 },
    { x: 100 + w, y: 200 },
    { x: 100 + w, y: 200 + h },
    { x: 100, y: 200 + h },
  ],
  widthPt: w,
  heightPt: h,
  angle: 0,
};

describe("zoneFromRect", () => {
  it("puts the corners at applyFit on the ground", () => {
    const zone = zoneFromRect({ rect, fit, groundAt: (x) => x * 2, fallbackY: 9, metresPerPt: 1 / PT_PER_M });
    zone.corners.forEach((c, i) => {
      const xz = applyFit(fit, rect.corners[i]);
      expect(c).toEqual({ x: xz.x, y: xz.x * 2, z: xz.z });
    });
  });

  it("reports the drawn size in metres", () => {
    const zone = zoneFromRect({ rect, fit, groundAt: () => 0, fallbackY: 0, metresPerPt: 1 / PT_PER_M });
    expect(zone.drawingWidthM).toBeCloseTo(7.5, 12);
    expect(zone.drawingHeightM).toBeCloseTo(13.0, 12);
  });

  it("gives a corner whose probe misses the fallback height", () => {
    const first = applyFit(fit, rect.corners[0]);
    const zone = zoneFromRect({
      rect,
      fit,
      groundAt: (x, z) => (x === first.x && z === first.z ? null : 1),
      fallbackY: 0.7,
      metresPerPt: null,
    });
    expect(zone.corners.map((c) => c.y)).toEqual([0.7, 1, 1, 1]);
  });

  it("has no sizes without a drawing scale", () => {
    const zone = zoneFromRect({ rect, fit, groundAt: () => 0, fallbackY: 0, metresPerPt: null });
    expect([zone.drawingWidthM, zone.drawingHeightM]).toEqual([null, null]);
  });
});
