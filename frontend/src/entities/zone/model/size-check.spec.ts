import { describe, expect, it } from "vitest";
import { sizeCheck } from "./size-check";
import type { Zone } from "./zone";

const zone = (w: number, h: number, dw: number | null, dh: number | null): Zone => ({
  id: 1,
  title: "Z",
  corners: [
    { x: 0, y: 0, z: 0 },
    { x: w, y: 0, z: 0 },
    { x: w, y: 0, z: h },
    { x: 0, y: 0, z: h },
  ],
  tags: [],
  drawingWidthM: dw,
  drawingHeightM: dh,
  createdAt: "",
  updatedAt: "",
});

describe("sizeCheck", () => {
  it("prints both sizes and the difference", () => {
    expect(sizeCheck(zone(7.4, 12.9, 7.5, 13), 1)).toEqual({
      text: "Drawing 7.5 × 13.0 m · Model 7.4 × 12.9 m (−1 %)",
      warn: false,
    });
  });
  it("warns in words above 3 %", () => {
    const r = sizeCheck(zone(7.73, 13, 7.5, 13), 1);
    expect(r?.warn).toBe(true);
    expect(r?.text).toContain("differs");
  });
  it("does not warn at exactly 3 %", () => expect(sizeCheck(zone(10.3, 10, 10, 10), 1)?.warn).toBe(false));
  it("signs an increase with +", () => expect(sizeCheck(zone(7.65, 13, 7.5, 13), 1)?.text).toContain("(+2 %)"));
  it("is null without a drawing size", () => expect(sizeCheck(zone(1, 1, null, null), 1)).toBeNull());
});
