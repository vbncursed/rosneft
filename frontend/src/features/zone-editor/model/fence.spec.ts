import { describe, expect, it } from "vitest";
import { validFence, rectInsideFence } from "./fence";

const p = (x: number, y: number) => ({ x, y });
const square = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];

describe("fence geometry", () => {
  it("rejects crossing and repeated vertices", () => {
    expect(validFence([p(0, 0), p(10, 10), p(0, 10), p(10, 0)])).toBe(false);
    expect(validFence([...square, square[1]])).toBe(false);
    expect(validFence(square.toReversed())).toBe(true);
    expect(validFence([p(0, 0), p(10, 0), p(5, 0), p(5, 5), p(0, 5)])).toBe(false);
  });
  it("rejects crossings at different scales and translations", () => {
    const crossing = [p(0, 0), p(2, 2), p(0, 2), p(3, 0)];
    for (const [scale, offset] of [
      [0.001, 0],
      [1, 1000],
      [1000, -2000],
    ]) {
      expect(validFence(crossing.map(({ x, y }) => p(x * scale + offset, y * scale + offset)))).toBe(false);
    }
  });
  it("rejects collinear overlaps and accepts a small simple contour", () => {
    expect(validFence([p(0, 0), p(0.003, 0), p(0.001, 0), p(0.001, 0.002), p(0, 0.002)])).toBe(false);
    expect(validFence([p(0, 0), p(0.003, 0), p(0.003, 0.002), p(0, 0.002)])).toBe(true);
  });
  it("allows touching and overlapping boundary edges", () => {
    expect(rectInsideFence(square, square)).toBe(true);
    expect(rectInsideFence([p(0, 2), p(5, 2), p(5, 5), p(0, 5)], square)).toBe(true);
  });
  it("detects a concave notch between corners inside", () => {
    const fence = [p(0, 0), p(10, 0), p(10, 10), p(6, 10), p(6, 4), p(4, 4), p(4, 10), p(0, 10)];
    expect(rectInsideFence([p(2, 2), p(8, 2), p(8, 8), p(2, 8)], fence)).toBe(false);
  });
});
