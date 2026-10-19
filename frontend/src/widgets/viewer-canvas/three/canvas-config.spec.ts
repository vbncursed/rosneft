import { describe, expect, it } from "vitest";
import { CAMERA, DPR_RANGE, GL_CONFIG, GRID_POSITION } from "./canvas-config";

describe("canvas-config", () => {
  it("keeps the depth range a 24-bit buffer resolves (far/near ≤ 5000)", () => {
    expect(CAMERA.far / CAMERA.near).toBeLessThanOrEqual(5000);
  });
  it("caps the pixel density at 1.5", () => {
    expect(DPR_RANGE).toEqual([1, 1.5]);
  });
  it("renders opaque, so the theme colour is the background", () => {
    expect(GL_CONFIG.alpha).toBe(false);
  });
  it("puts the grid below a normalised mesh (max half-extent 1)", () => {
    expect(GRID_POSITION[1]).toBeLessThan(-1);
  });
});
