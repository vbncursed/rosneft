import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { describe, expect, it } from "vitest";
import { applyPose, setClip, setCursor, setEnabled, setFov } from "./free-cam-writes";

describe("free cam writes", () => {
  it("setClip writes both planes and refreshes the projection", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 500);
    const before = camera.projectionMatrix.clone();
    setClip(camera, { near: 0.01, far: 9 });
    expect([camera.near, camera.far]).toEqual([0.01, 9]);
    expect(camera.projectionMatrix.equals(before)).toBe(false);
  });

  it("setFov widens the view and refreshes the projection", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 500);
    const before = camera.projectionMatrix.clone();
    setFov(camera, 53);
    expect(camera.fov).toBe(53);
    expect(camera.projectionMatrix.equals(before)).toBe(false);
  });

  it("applyPose places the camera and turns it yaw first, without roll", () => {
    const camera = new PerspectiveCamera();
    applyPose(camera, { position: new Vector3(1, 2, 3), yaw: Math.PI / 2, pitch: 0, velocity: new Vector3() });
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.getWorldDirection(new Vector3()).x).toBeCloseTo(-1);
  });

  it("setEnabled and setCursor write the flag and the cursor", () => {
    const controls = { enabled: true } as OrbitControlsImpl;
    setEnabled(controls, false);
    expect(controls.enabled).toBe(false);
    const canvas = document.createElement("canvas");
    setCursor(canvas, "grab");
    expect(canvas.style.cursor).toBe("grab");
  });
});
