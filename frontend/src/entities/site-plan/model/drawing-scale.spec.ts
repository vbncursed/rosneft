import { describe, expect, it } from "vitest";

import type { CalibrationPair } from "./auto-pairs";
import { controlPoints } from "./control-points";
import { drawingScale, scaleDifference } from "./drawing-scale";
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
