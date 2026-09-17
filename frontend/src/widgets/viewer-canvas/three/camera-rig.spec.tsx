import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("damping", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const reducedMotion = (matches: boolean) =>
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      );

    it("lets an orbit coast to a stop instead of halting where the pointer let go", async () => {
      reducedMotion(false);
      await ReactThreeTestRenderer.create(rig(0));
      expect(controls!.enableDamping).toBe(true);
      expect(controls!.dampingFactor).toBe(0.08);
    });

    it("keeps updating the controls frame by frame while the view is still moving", async () => {
      // frameloop="demand" draws nothing on its own: each frame of the coast
      // has to be asked for, and it stops once update() reports no change.
      reducedMotion(false);
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
      vi.stubGlobal("cancelAnimationFrame", () => {});
      await ReactThreeTestRenderer.create(rig(0));
      // The mount's own reset may have asked for a frame; let it settle.
      while (frames.length > 0) frames.shift()!(0);
      // Nothing moved: the real update() then fires no "change".
      const update = vi.spyOn(controls!, "update").mockImplementation(() => {});

      const change = () => controls!.dispatchEvent({ type: "change", target: controls } as never);
      change();
      change();
      expect(frames).toHaveLength(1);
      frames.shift()!(0);
      expect(update).toHaveBeenCalledTimes(1);
      // update() moved nothing, so it fired no change and nothing is queued.
      expect(frames).toHaveLength(0);
    });

    it("spends the leftover inertia before a reset, so the reset view stays put", async () => {
      reducedMotion(false);
      const r = await ReactThreeTestRenderer.create(rig(0));
      const order: string[] = [];
      vi.spyOn(controls!, "update").mockImplementation(() => {
        order.push(`update:${controls!.enableDamping}`);
        return false;
      });
      vi.spyOn(controls!, "reset").mockImplementation(() => {
        order.push("reset");
      });
      await r.update(rig(1));
      expect(order[0]).toBe("update:false");
      expect(order.indexOf("reset")).toBeGreaterThan(0);
      expect(controls!.enableDamping).toBe(true);
    });

    it("stops dead under reduced motion", async () => {
      reducedMotion(true);
      await ReactThreeTestRenderer.create(rig(0));
      expect(controls!.enableDamping).toBe(false);
    });
  });
});
