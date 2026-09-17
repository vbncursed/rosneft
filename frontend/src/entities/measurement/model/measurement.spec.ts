import { describe, expect, it } from "vitest";
import type { Measurement, MeasurePoint } from "./measurement";

describe("Measurement", () => {
  it("pairs two scene-space points under a stable id", () => {
    const a: MeasurePoint = { x: 1, y: 2, z: 3 };
    const b: MeasurePoint = { x: 0, y: 0, z: 0 };
    const measurement: Measurement = { id: 1, a, b };
    expect(measurement).toEqual({ id: 1, a: { x: 1, y: 2, z: 3 }, b: { x: 0, y: 0, z: 0 } });
  });
});
