import { describe, expect, it } from "vitest";

import { detectRects, MIN_SIDE_PT_UNSCALED } from "./detect-rects";
import { extractPaths, type PagePath } from "./extract-paths";
import plan from "./__data__/mr1-plan.json";

const PT_PER_M = 6.6;
const PAGE = plan.page;
const FIXTURE = extractPaths(plan.opList, plan.ops, plan.viewport);

const outline = (pts: [number, number][], over: Partial<PagePath> = {}): PagePath => ({
  points: pts.map(([x, y]) => ({ x, y })),
  closed: true,
  paint: "stroke",
  stroke: "#000000",
  fill: null,
  lineWidth: 1,
  ...over,
});
const box = (x: number, y: number, w: number, h: number) =>
  outline([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
const sides = (r: { widthPt: number; heightPt: number }) =>
  [r.widthPt, r.heightPt].map((v) => v / PT_PER_M).sort((a, b) => a - b);

describe("detectRects on synthetic outlines", () => {
  it("finds a closed right-angled four-vertex stroke", () => {
    const [r] = detectRects([box(100, 100, 40, 20)], PAGE, MIN_SIDE_PT_UNSCALED);
    expect([r?.widthPt, r?.heightPt]).toEqual([40, 20]);
    expect(r?.corners).toHaveLength(4);
  });

  it("accepts a path that returns to its start instead of closing", () => {
    const p = outline(
      [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
        [0, 0],
      ],
      { closed: false },
    );
    expect(detectRects([p], PAGE, 6)).toHaveLength(1);
  });

  it("ignores duplicate and collinear vertices", () => {
    const p = outline([
      [0, 0],
      [15, 0],
      [15, 0],
      [30, 0],
      [30, 30],
      [0, 30],
    ]);
    expect(detectRects([p], PAGE, 6)).toHaveLength(1);
  });

  it("keeps a rotated rectangle and reports its angle", () => {
    const a = Math.PI / 6;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const p = outline([
      [0, 0],
      [40 * c, 40 * s],
      [40 * c - 20 * s, 40 * s + 20 * c],
      [-20 * s, 20 * c],
    ]);
    const [r] = detectRects([p], PAGE, 6);
    expect(r?.angle).toBeCloseTo(a, 6);
    expect(Math.min(r.widthPt, r.heightPt)).toBeCloseTo(20, 6);
  });

  it("rejects a parallelogram beyond the cos 0.05 tolerance but accepts one inside", () => {
    const skew = (dx: number) =>
      outline([
        [0, 0],
        [40, 0],
        [40 + dx, 20],
        [dx, 20],
      ]);
    expect(detectRects([skew(3)], PAGE, 6)).toHaveLength(0); // cos ~ 0.15
    expect(detectRects([skew(0.5)], PAGE, 6)).toHaveLength(1); // cos ~ 0.025
  });

  it("drops a rectangle under minSidePt and the page frame", () => {
    expect(detectRects([box(0, 0, 40, 5)], PAGE, 6)).toHaveLength(0);
    expect(detectRects([box(0, 0, PAGE.width, PAGE.height)], PAGE, 6)).toHaveLength(0);
  });

  it("merges duplicates within 0.5 pt", () => {
    expect(detectRects([box(100, 100, 40, 20), box(100.3, 100.2, 40, 20)], PAGE, 6)).toHaveLength(1);
    expect(detectRects([box(100, 100, 40, 20), box(102, 100, 40, 20)], PAGE, 6)).toHaveLength(2);
  });

  it("ignores curved or non-rectangular shapes", () => {
    const tri = outline([
      [0, 0],
      [30, 0],
      [0, 30],
    ]);
    const five = outline([
      [0, 0],
      [30, 0],
      [40, 15],
      [30, 30],
      [0, 30],
    ]);
    expect(detectRects([tri, five], PAGE, 6)).toEqual([]);
  });
});

describe("detectRects on the MR1 site plan", () => {
  const rects = detectRects(FIXTURE, PAGE, MIN_SIDE_PT_UNSCALED);

  it("reads the N2 Area centreline as 7.5 x 13.0 m", () => {
    const n2 = rects.find((r) => sides(r).every((v, i) => Math.abs(v - [7.5, 13.0][i]) < 0.15));
    expect(n2).toBeDefined();
  });

  it("finds the red Loading Area at 15.0 x 14.9 m", () => {
    const loading = rects.find((r) => sides(r).every((v, i) => Math.abs(v - [14.9, 15.0][i]) < 0.2));
    expect(loading).toBeDefined();
  });

  it("finds the 14 tank-row frames, all one size", () => {
    // Outer 2.7 x 13.1 m with a ~0.1 m line: the centreline is 2.6 x 13.0.
    const tanks = rects.filter((r) => {
      const [w, h] = sides(r);
      return Math.abs(w - 2.6) < 0.1 && Math.abs(h - 13.0) < 0.1;
    });
    const xs = tanks.map((r) => Math.min(...r.corners.map((c) => c.x))).sort((p, q) => p - q);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    // 14 frames stand in a row (gaps under 30 pt); a 15th stands apart at the east end.
    expect(xs).toHaveLength(15);
    expect(gaps.filter((g) => g < 30)).toHaveLength(13);
    expect(gaps.at(-1)).toBeGreaterThan(30);
  });

  it("never returns the page frame or a duplicate", () => {
    for (const r of rects) expect(Math.max(r.widthPt, r.heightPt)).toBeLessThan(PAGE.width * 0.9);
    const keys = rects.map((r) =>
      r.corners
        .map((c) => `${Math.round(c.x / 0.5)},${Math.round(c.y / 0.5)}`)
        .sort()
        .join("|"),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
