import { describe, expect, it } from "vitest";

import type { CalibrationPair } from "./auto-pairs";
import { controlPoints } from "./control-points";
import { controlScale, drawingScale, planScale, scaleDifference } from "./drawing-scale";
import plan from "./__data__/mr1-plan.json";

const pair = (x: number, y: number, utm: CalibrationPair["utm"]): CalibrationPair => ({
  pdf: { x, y },
  scene: { x: 0, y: 0, z: 0 },
  utm,
});

describe("drawingScale", () => {
  it("is null with fewer than two UTM pairs", () => {
    expect(drawingScale([])).toBeNull();
    expect(drawingScale([pair(0, 0, { e: 1, n: 1 }), pair(100, 0, null)])).toBeNull();
  });

  it("reads metres per pt from the ME points", () => {
    const me = controlPoints(plan.text, plan.viewport).filter((p) => p.label.startsWith("ME"));
    const pairs = me.map((p) => pair(p.at.x, p.at.y, { e: p.e, n: p.n }));
    expect(drawingScale(pairs)).toBeCloseTo(0.1515, 3);
  });

  it("is null when the plan points coincide", () => {
    expect(drawingScale([pair(5, 5, { e: 0, n: 0 }), pair(5, 5, { e: 9, n: 9 })])).toBeNull();
  });
});

const ctl = (x: number, y: number, e: number, n: number) => ({ label: "P", at: { x, y }, e, n });

describe("controlScale", () => {
  it("reads metres per pt from the mr1 survey labels", () => {
    const got = controlScale(controlPoints(plan.text, plan.viewport));
    expect(Math.abs((got as number) / 0.1515 - 1)).toBeLessThan(0.01);
  });

  it("uses a bare plan point only when there are no two named marks", () => {
    const bare = { ...ctl(0, 0, 0, 0), label: "Plan point" };
    expect(controlScale([bare, ctl(100, 0, 10, 0)])).toBeCloseTo(0.1, 9);
    expect(controlScale([{ ...bare, at: { x: 500, y: 0 } }, ctl(100, 0, 10, 0), ctl(0, 100, 0, 10)])).toBeCloseTo(
      0.1,
      9,
    );
  });

  it("needs two points", () => {
    expect(controlScale([])).toBeNull();
    expect(controlScale([ctl(0, 0, 1, 1)])).toBeNull();
  });

  it("is null when the points coincide on the page", () => {
    expect(controlScale([ctl(5, 5, 0, 0), ctl(5, 5, 9, 9)])).toBeNull();
  });

  it("ignores a non-finite point and takes the median of the rest", () => {
    const pts = [ctl(0, 0, 0, 0), ctl(100, 0, 10, 0), ctl(0, 100, 0, 10), ctl(Number.NaN, 0, 5, 5)];
    expect(controlScale(pts)).toBeCloseTo(0.1, 9);
    expect(controlScale([ctl(0, 0, 0, 0), ctl(100, 0, Number.POSITIVE_INFINITY, 0)])).toBeNull();
  });
});

describe("planScale", () => {
  const withUtm = [pair(0, 0, { e: 0, n: 0 }), pair(100, 0, { e: 20, n: 0 })];

  it("prefers the plan's own control points over the user's pairs", () => {
    expect(planScale([ctl(0, 0, 0, 0), ctl(100, 0, 10, 0)], withUtm)).toBeCloseTo(0.1, 9);
  });

  it("falls back to the pairs, then to null", () => {
    expect(planScale(null, withUtm)).toBeCloseTo(0.2, 9);
    expect(planScale([], [])).toBeNull();
  });
});

describe("scaleDifference", () => {
  const fit = { scale: 0.001, rotation: 0, tx: 0, tz: 0 };

  it("is zero when the model matches the drawing", () => {
    expect(scaleDifference(fit, 100, 0.1)).toBeCloseTo(0, 12);
  });

  it("is positive when the model is larger", () => {
    expect(scaleDifference(fit, 110, 0.1)).toBeCloseTo(0.1, 12);
    expect(scaleDifference(fit, 90, 0.1)).toBeCloseTo(-0.1, 12);
  });
});
