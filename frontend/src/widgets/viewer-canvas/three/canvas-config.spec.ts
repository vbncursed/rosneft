import { describe, expect, it } from "vitest";
import { CAMERA, DPR_RANGE, GL_CONFIG, GRID_POSITION } from "./canvas-config";

describe("canvas-config", () => {
  // Only the starting values. drei's <Bounds clip> rewrites near and far on
  // every fit (near = distance/100, far = distance×100), so the depth range
  // the camera renders with is not CAMERA's; nothing here checks that.
  it("starts with a valid near/far pair, before Bounds rewrites both on fit", () => {
    expect(CAMERA.near).toBeGreaterThan(0);
    expect(CAMERA.far).toBeGreaterThan(CAMERA.near);
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
