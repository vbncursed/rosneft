import { describe, expect, it } from "vitest";
import { manualRect, rectFromDrag } from "./manual-rect";

describe("manual rectangles", () => {
  it("normalizes drag direction in PDF page coordinates", () => {
    const rect = rectFromDrag({ x: 30, y: 40 }, { x: 10, y: 20 });
    expect(rect.corners).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 40 },
      { x: 10, y: 40 },
    ]);
  });
  it("rotates width and height around the centre", () => {
    const rect = manualRect({ x: 10, y: 20, width: 8, height: 4, angle: 90 });
    expect(rect.corners[0].x).toBeCloseTo(12);
    expect(rect.corners[0].y).toBeCloseTo(16);
    expect(rect.corners[2].x).toBeCloseTo(8);
    expect(rect.corners[2].y).toBeCloseTo(24);
    expect(rect.widthPt).toBe(8);
    expect(rect.heightPt).toBe(4);
  });
});
