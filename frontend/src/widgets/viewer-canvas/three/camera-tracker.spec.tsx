import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Camera } from "three";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "@/entities/placement";
import CameraTracker from "./camera-tracker";
import { WithControls, fakeControls } from "./testing";

async function mount() {
  const controls = fakeControls();
  const probe: { camera?: Camera } = {};
  const positionRef: { current: Vec3 | null } = { current: null };
  const yawRef: { current: number | null } = { current: null };
  await ReactThreeTestRenderer.create(
    <WithControls controls={controls} probe={probe}>
      <CameraTracker positionRef={positionRef} yawRef={yawRef} />
    </WithControls>,
  );
  return { controls, camera: probe.camera!, positionRef, yawRef };
}

describe("CameraTracker", () => {
  it("has the live camera position ready before anything moves", async () => {
    const { camera, positionRef } = await mount();
    expect(positionRef.current).toEqual({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });
  });

  it("follows the camera on every controls change", async () => {
    const { camera, controls, positionRef } = await mount();
    camera.position.set(4, 5, 6);
    controls.fire("change");
    expect(positionRef.current).toEqual({ x: 4, y: 5, z: 6 });
  });

  it("reads yaw 0 looking down +Z and π/2 looking down +X — the angle the edit panel captures", async () => {
    const { camera, controls, yawRef } = await mount();
    camera.position.set(0, 0, 0);

    camera.lookAt(0, 0, 1);
    controls.fire("change");
    expect(yawRef.current).toBeCloseTo(0);

    camera.lookAt(1, 0, 0);
    controls.fire("change");
    expect(yawRef.current).toBeCloseTo(Math.PI / 2);
  });

  it("stops writing once it is gone — a stale ref would capture a view nobody is looking at", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    const positionRef: { current: Vec3 | null } = { current: null };
    const yawRef: { current: number | null } = { current: null };
    const bare = <WithControls controls={controls} probe={probe} />;
    const r = await ReactThreeTestRenderer.create(
      <WithControls controls={controls} probe={probe}>
        <CameraTracker positionRef={positionRef} yawRef={yawRef} />
      </WithControls>,
    );

    await r.update(bare);
    probe.camera!.position.set(7, 7, 7);
    controls.fire("change");

    expect(positionRef.current).not.toEqual({ x: 7, y: 7, z: 7 });
  });
});
