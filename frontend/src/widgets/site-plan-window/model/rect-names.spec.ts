import { describe, expect, it } from "vitest";
import type { PlanRect } from "@/entities/site-plan";
import { rectNames } from "./rect-names";

const rect = (widthPt: number, heightPt: number): PlanRect => ({
  corners: [
    { x: 0, y: 0 },
    { x: widthPt, y: 0 },
    { x: widthPt, y: heightPt },
    { x: 0, y: heightPt },
  ],
  widthPt,
  heightPt,
  angle: 0,
});

describe("rectNames", () => {
  it("prints metres to one decimal", () => {
    expect(rectNames([rect(49.5, 85.8)], 1 / 6.6)).toEqual(["Rectangle 7.5 × 13.0 m"]);
  });

  it("falls back to points", () => {
    expect(rectNames([rect(49.5, 85.8)], null)).toEqual(["Rectangle 50 × 86 pt"]);
  });

  it("numbers only the twins", () => {
    expect(rectNames([rect(40, 40), rect(10, 10), rect(40, 40)], 1 / 6.6)).toEqual([
      "Rectangle 6.1 × 6.1 m, 1 of 2",
      "Rectangle 1.5 × 1.5 m",
      "Rectangle 6.1 × 6.1 m, 2 of 2",
    ]);
  });
});
