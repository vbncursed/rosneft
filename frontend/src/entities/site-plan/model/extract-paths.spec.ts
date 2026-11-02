import { describe, expect, it } from "vitest";

import { extractPaths } from "./extract-paths";

const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setLineWidth: 2,
  constructPath: 91,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  fillStroke: 24,
  closeFillStroke: 26,
  endPath: 28,
};
const FLIP = [1, 0, 0, -1, 0, 100]; // a 100 pt tall page, y up -> y down

const list = (...ops: [number, unknown][]) => ({ fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) });
const path = (paint: number, ...codes: number[]): [number, unknown] => [
  OPS.constructPath,
  [paint, [Float32Array.from(codes)], null],
];
const SQUARE = [0, 0, 0, 1, 10, 0, 1, 10, 10, 1, 0, 10, 4];

describe("extractPaths", () => {
  it("returns subpaths in top-down page points", () => {
    const [p] = extractPaths(list(path(OPS.stroke, ...SQUARE)), OPS, FLIP);
    expect(p?.points).toEqual([
      { x: 0, y: 100 },
      { x: 10, y: 100 },
      { x: 10, y: 90 },
      { x: 0, y: 90 },
    ]);
    expect(p?.closed).toBe(true);
  });

  it("tracks the CTM through save, transform and restore", () => {
    const paths = extractPaths(
      list(
        [OPS.save, null],
        [OPS.transform, [2, 0, 0, 2, 10, 10]],
        path(OPS.stroke, 0, 1, 1, 1, 2, 1),
        [OPS.restore, null],
        path(OPS.stroke, 0, 1, 1, 1, 2, 1),
      ),
      OPS,
      [1, 0, 0, 1, 0, 0],
    );
    expect(paths[0]?.points).toEqual([
      { x: 12, y: 12 },
      { x: 14, y: 12 },
    ]);
    expect(paths[1]?.points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("composes nested transforms in PDF order", () => {
    const [p] = extractPaths(
      list([OPS.transform, [1, 0, 0, 1, 5, 0]], [OPS.transform, [2, 0, 0, 2, 0, 0]], path(OPS.stroke, 0, 1, 1)),
      OPS,
      [1, 0, 0, 1, 0, 0],
    );
    expect(p?.points).toEqual([{ x: 7, y: 2 }]);
  });

  it("splits subpaths and keeps curve control points", () => {
    const paths = extractPaths(
      list(path(OPS.stroke, 0, 0, 0, 2, 1, 1, 2, 2, 3, 3, 4, 0, 1, 5, 3, 6, 6, 7, 7)),
      OPS,
      [1, 0, 0, 1, 0, 0],
    );
    expect(paths).toHaveLength(2);
    expect(paths[0]?.points).toHaveLength(4); // moveTo + curveTo (3 points)
    expect(paths[0]?.points[3]).toEqual({ x: 3, y: 3 });
    expect(paths[1]?.points).toEqual([
      { x: 1, y: 5 },
      { x: 6, y: 6 },
      { x: 7, y: 7 },
    ]); // moveTo + quadraticCurveTo with control and end point
  });

  it("maps paint ops and carries colours and line width", () => {
    const paths = extractPaths(
      list(
        [OPS.setStrokeRGBColor, ["#112233"]],
        [OPS.setFillRGBColor, ["#aabbcc"]],
        [OPS.setLineWidth, [3]],
        path(OPS.stroke, 0, 0, 0, 1, 1, 1),
        path(OPS.fill, 0, 0, 0, 1, 1, 1),
        path(OPS.closeFillStroke, 0, 0, 0, 1, 1, 1),
        path(OPS.endPath, 0, 0, 0, 1, 1, 1),
      ),
      OPS,
      [1, 0, 0, 1, 0, 0],
    );
    expect(paths.map((p) => [p.paint, p.stroke, p.fill, p.closed, p.lineWidth])).toEqual([
      ["stroke", "#112233", null, false, 3],
      ["fill", null, "#aabbcc", true, 3],
      ["fillStroke", "#112233", "#aabbcc", true, 3],
    ]);
  });

  it("closes a subpath on closeStroke and accepts plain arrays", () => {
    const [p] = extractPaths(
      list([OPS.constructPath, [OPS.closeStroke, [[0, 0, 0, 1, 1, 1]], null]]),
      OPS,
      [1, 0, 0, 1, 0, 0],
    );
    expect(p?.closed).toBe(true);
  });
});
