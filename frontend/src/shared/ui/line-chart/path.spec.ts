import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEOMETRY,
  scaleY,
  sharedMax,
  toAreaPath,
  toLinePath,
} from "./path";

const geo = DEFAULT_GEOMETRY;

describe("scaleY", () => {
  it("puts the maximum at the top of the band and zero at the bottom", () => {
    expect(scaleY(10, 10, geo)).toBe(geo.padTop);
    expect(scaleY(0, 10, geo)).toBe(geo.height - geo.padBottom);
  });

  it("puts the midpoint halfway", () => {
    const top = scaleY(10, 10, geo);
    const bottom = scaleY(0, 10, geo);
    expect(scaleY(5, 10, geo)).toBeCloseTo((top + bottom) / 2, 5);
  });

  it("clamps a value above the maximum rather than drawing off-chart", () => {
    expect(scaleY(20, 10, geo)).toBe(scaleY(10, 10, geo));
  });

  it("clamps a negative value to the baseline", () => {
    expect(scaleY(-5, 10, geo)).toBe(scaleY(0, 10, geo));
  });

  it("sits on the baseline when the maximum is zero", () => {
    expect(scaleY(0, 0, geo)).toBe(geo.height - geo.padBottom);
  });
});

describe("toLinePath", () => {
  it("starts with a move and continues with lines", () => {
    const d = toLinePath([1, 2, 3], 3, geo);
    expect(d.startsWith("M0.0 ")).toBe(true);
    expect(d.split("L")).toHaveLength(3);
  });

  it("spans the full width, first point to last", () => {
    const d = toLinePath([1, 2, 3], 3, geo);
    expect(d).toContain("M0.0");
    expect(d).toContain(`L${geo.width.toFixed(1)}`);
  });

  it("draws a single reading as a flat segment, not an invisible point", () => {
    const d = toLinePath([5], 10, geo);
    expect(d).toBe(`M0 ${scaleY(5, 10, geo).toFixed(1)} L300 ${scaleY(5, 10, geo).toFixed(1)}`);
  });

  it("returns nothing for an empty series", () => {
    expect(toLinePath([], 10, geo)).toBe("");
  });

  it("draws a flat-zero series along the baseline", () => {
    const d = toLinePath([0, 0, 0], 1, geo);
    const y = (geo.height - geo.padBottom).toFixed(1);
    expect(d).toBe(`M0.0 ${y} L150.0 ${y} L300.0 ${y}`);
  });

  it("breaks the line at a gap and never draws across it", () => {
    const g = { width: 300, height: 88, padTop: 12, padBottom: 6 };
    const [y0, y2, y3] = [1, 3, 4].map((v) => scaleY(v, 4, g).toFixed(1));
    // The leading 1 has no drawn neighbour either — nothing before it, a gap
    // right after — so it gets the same short dash an isolated mid-series
    // reading gets, and the line still never crosses the gap itself.
    expect(toLinePath([1, null, 3, 4], 4, g)).toBe(`M0.0 ${y0} L50.0 ${y0} M200.0 ${y2} L300.0 ${y3}`);
  });

  it("draws a lone reading between two gaps as a short flat dash, not nothing", () => {
    const y = scaleY(5, 10, DEFAULT_GEOMETRY).toFixed(1);
    expect(toLinePath([null, 5, null, null], 10)).toBe(`M100.0 ${y} L150.0 ${y}`);
  });

  it("draws the lone dash backwards when the isolated reading is the last value — forwards would clamp to zero length at the right edge", () => {
    const [y1, y2, y5] = [1, 2, 5].map((v) => scaleY(v, 10, DEFAULT_GEOMETRY).toFixed(1));
    expect(toLinePath([1, 2, null, 5], 10)).toBe(`M0.0 ${y1} L100.0 ${y2} M300.0 ${y5} L250.0 ${y5}`);
  });
});

describe("toAreaPath", () => {
  it("closes the line down to the baseline", () => {
    const area = toAreaPath([1, 2], 2, geo);
    expect(area.endsWith(`L${geo.width} ${geo.height} L0 ${geo.height} Z`)).toBe(true);
  });

  it("returns nothing when there is no line", () => {
    expect(toAreaPath([], 1, geo)).toBe("");
  });

  it("fills nothing when the series has a gap", () => {
    expect(toAreaPath([1, null, 3], 3, geo)).toBe("");
  });
});

describe("sharedMax", () => {
  it("takes the tallest across every series, so lines stay comparable", () => {
    expect(sharedMax([{ values: [1, 5] }, { values: [3, 9] }])).toBe(9);
  });

  it("never returns zero — dividing by it would put every point at NaN", () => {
    expect(sharedMax([{ values: [0, 0] }])).toBe(1);
    expect(sharedMax([])).toBe(1);
  });

  it("shares the maximum over present values only, ignoring gaps", () => {
    expect(sharedMax([{ values: [1, null, 5] }])).toBe(5);
  });
});
