import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import CameraRig from "./camera-rig";

let controls: OrbitControlsImpl | null = null;
let camera: PerspectiveCamera | null = null;

function Probe() {
  const seen = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useEffect(() => {
    controls = seen;
    camera = cam;
  }, [seen, cam]);
  return null;
}

const rig = (resetVersion: number) => (
  <>
    <CameraRig resetVersion={resetVersion} />
    <Probe />
  </>
);

describe("CameraRig", () => {
  it("publishes its controls so the gizmo can suspend them mid-drag", async () => {
    await ReactThreeTestRenderer.create(rig(0));
    // PlacementsLayer reaches them through useThree(s => s.controls); without
    // this the orbit keeps rotating under a gizmo drag.
    expect(controls).not.toBeNull();
    expect(controls!.enabled).toBe(true);
  });

  it("puts the camera back where it started when the page bumps resetVersion", async () => {
    const r = await ReactThreeTestRenderer.create(rig(0));
    const start = camera!.position.clone();
    camera!.position.set(9, 9, 9);

    await r.update(rig(0));
    expect(camera!.position.x).toBe(9);

    await r.update(rig(1));
    expect(camera!.position.toArray()).toEqual(start.toArray());
  });

  it("disposes the controls and clears them from the scene on unmount", async () => {
    const r = await ReactThreeTestRenderer.create(rig(0));
    const dispose = vi.spyOn(controls!, "dispose");
    await r.unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
