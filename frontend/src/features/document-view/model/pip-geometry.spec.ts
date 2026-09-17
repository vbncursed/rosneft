import { describe, expect, it } from "vitest";
import { dock, moved, PIP_INIT, PIP_MIN, resized } from "./pip-geometry";

const VIEWPORT = { w: 1440, h: 900 };

describe("dock", () => {
  it("docks bottom-right at the inset", () => {
    expect(dock(VIEWPORT, 14)).toEqual({ x: 866, y: 486, w: 560, h: 400 });
  });

  it("never goes negative when the viewport is smaller than the window", () => {
    expect(dock({ w: 300, h: 200 }, 14)).toEqual({ x: 14, y: 14, w: PIP_INIT.w, h: PIP_INIT.h });
  });
});

describe("moved", () => {
  const base = { x: 100, y: 100, w: 560, h: 400 };

  it("applies the delta within bounds", () => {
    expect(moved(base, 30, -20, VIEWPORT)).toEqual({ x: 130, y: 80, w: 560, h: 400 });
  });

  it("clamps at 0", () => {
    expect(moved(base, -500, -500, VIEWPORT)).toEqual({ x: 0, y: 0, w: 560, h: 400 });
  });

  it("clamps at viewport minus size", () => {
    expect(moved(base, 5000, 5000, VIEWPORT)).toEqual({ x: 880, y: 500, w: 560, h: 400 });
  });

  it("never goes negative when the viewport is smaller than the window — the lower bound wins", () => {
    // viewport.w - base.w and viewport.h - base.h are both negative here;
    // 0 must win that empty interval, not the negative upper bound.
    expect(moved(base, 0, 0, { w: 460, h: 364 })).toEqual({ x: 0, y: 0, w: 560, h: 400 });
  });
});

describe("resized", () => {
  const base = { x: 800, y: 400, w: 560, h: 400 };

  it("applies the delta within bounds", () => {
    expect(resized(base, 40, 40, VIEWPORT)).toEqual({ x: 800, y: 400, w: 600, h: 440 });
  });

  it("clamps at the minimum", () => {
    expect(resized(base, -1000, -1000, VIEWPORT)).toEqual({
      x: 800,
      y: 400,
      w: PIP_MIN.w,
      h: PIP_MIN.h,
    });
  });

  it("clamps at viewport minus origin", () => {
    expect(resized(base, 5000, 5000, VIEWPORT)).toEqual({ x: 800, y: 400, w: 640, h: 500 });
  });

  it("never shrinks below the minimum when the viewport is smaller than the origin — the lower bound wins", () => {
    // viewport.w - base.x and viewport.h - base.y are both below PIP_MIN here;
    // the minimum must win that empty interval, not the smaller upper bound.
    expect(resized(base, 0, 0, { w: 900, h: 600 })).toEqual({
      x: 800,
      y: 400,
      w: PIP_MIN.w,
      h: PIP_MIN.h,
    });
  });
});
