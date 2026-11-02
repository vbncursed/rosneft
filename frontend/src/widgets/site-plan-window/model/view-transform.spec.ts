import { describe, expect, it } from "vitest";
import { fitView, MAX_ZOOM, panBy, toPage, zoomAt } from "./view-transform";

describe("fitView", () => {
  it("fits the page inside the box and centres it", () => {
    const v = fitView({ w: 1000, h: 400 }, { width: 200, height: 100 });
    expect(v.k).toBe(4);
    expect(v).toMatchObject({ x: 100, y: 0 });
  });

  it("stays at 1 : 1 while the box has no size", () => {
    expect(fitView({ w: 0, h: 0 }, { width: 200, height: 100 })).toEqual({ k: 1, x: 0, y: 0 });
  });
});

describe("zoomAt", () => {
  it("keeps the page point under the cursor still", () => {
    const v = { k: 2, x: 10, y: 20 };
    const before = toPage(v, { x: 300, y: 200 });
    const after = toPage(zoomAt(v, 1.5, { x: 300, y: 200 }), { x: 300, y: 200 });
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("clamps the zoom", () => {
    expect(zoomAt({ k: 1, x: 0, y: 0 }, 1000, { x: 0, y: 0 }).k).toBe(MAX_ZOOM);
    expect(zoomAt({ k: 1, x: 0, y: 0 }, 1e-6, { x: 0, y: 0 }).k).toBeGreaterThan(0);
  });
});

describe("panBy / toPage", () => {
  it("moves the page under the cursor", () => {
    const v = panBy({ k: 2, x: 0, y: 0 }, 40, -10);
    expect(toPage(v, { x: 40, y: -10 })).toEqual({ x: 0, y: 0 });
  });
});
