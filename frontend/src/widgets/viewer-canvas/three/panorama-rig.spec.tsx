import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { Camera } from "three";
import { describe, expect, it } from "vitest";
import PanoramaRig from "./panorama-rig";
import { WithControls, fakeControls } from "./testing";

const PANO = {
  id: 1,
  territorySlug: "t",
  slug: "s",
  title: "Control room",
  sourceBlobHash: "h",
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0,
  defaultYaw: Math.PI / 2,
  thumbnailBlobHash: null,
  updatedAt: "",
};

type Controls = ReturnType<typeof fakeControls>;

const tree = (controls: Controls, probe: { camera?: Camera }, panorama = PANO) => (
  <WithControls controls={controls} probe={probe}>
    <PanoramaRig panorama={panorama} />
  </WithControls>
);

describe("PanoramaRig", () => {
  it("pins the camera to the anchor, looks along defaultYaw, disables zoom and pan, and recentres on every change", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    await ReactThreeTestRenderer.create(tree(controls, probe));
    const cam = probe.camera!;

    expect(cam.position.toArray()).toEqual([1, 2, 3]);
    expect(controls.target.x).toBeCloseTo(1 + 0.01); // sin(π/2) · 0.01
    expect(controls.target.z).toBeCloseTo(3);
    expect(controls.enableZoom).toBe(false);
    expect(controls.enablePan).toBe(false);

    // OrbitControls orbits the eye off the anchor; the change listener puts it
    // back, which is what makes the rotation parallax-free.
    cam.position.set(1.5, 2, 3);
    controls.fire("change");
    expect(cam.position.toArray()).toEqual([1, 2, 3]);
  });

  it("re-pins without resetting the look when the anchor moves during calibration", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    const r = await ReactThreeTestRenderer.create(tree(controls, probe));

    await r.update(tree(controls, probe, { ...PANO, position: { x: 5, y: 2, z: 3 } }));

    expect(probe.camera!.position.toArray()).toEqual([5, 2, 3]);
    // Still looking along +X — a nudge of the anchor must not throw the
    // operator's view away mid-calibration.
    expect(controls.target.x).toBeCloseTo(5 + 0.01);
    expect(controls.target.z).toBeCloseTo(3);
  });

  it("re-enters on a different panorama: the new anchor and the new default look", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    const r = await ReactThreeTestRenderer.create(tree(controls, probe));

    const next = { ...PANO, id: 2, position: { x: 0, y: 0, z: 0 }, defaultYaw: 0 };
    await r.update(tree(controls, probe, next));

    expect(probe.camera!.position.toArray()).toEqual([0, 0, 0]);
    // defaultYaw 0 looks along +Z — a switch resets the look, a nudge does not.
    expect(controls.target.z).toBeCloseTo(0.01);
    expect(controls.target.x).toBeCloseTo(0);
  });

  it("survives a change fired with the eye already on the target", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    await ReactThreeTestRenderer.create(tree(controls, probe));

    probe.camera!.position.copy(controls.target);
    controls.fire("change");

    expect(controls.target.toArray().every(Number.isFinite)).toBe(true);
    expect(probe.camera!.position.toArray()).toEqual([1, 2, 3]);
  });

  it("restores the previous camera, target and flags on unmount", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    const bare = <WithControls controls={controls} probe={probe} />;
    const r = await ReactThreeTestRenderer.create(bare);
    const start = probe.camera!.position.clone();

    await r.update(tree(controls, probe));
    expect(probe.camera!.position.toArray()).toEqual([1, 2, 3]);

    await r.update(bare);
    expect(probe.camera!.position.toArray()).toEqual(start.toArray());
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    expect(controls.enableZoom).toBe(true);
    expect(controls.enablePan).toBe(true);
    // The rig clamps the orbit radius to LOOK_RADIUS while it holds the
    // camera; left behind, the 3D view could no longer be zoomed at all.
    expect(controls.minDistance).toBe(0.01);
    expect(controls.maxDistance).toBe(100);
  });

  it("a switch and then an unmount leaves nothing of either panorama behind", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    const bare = <WithControls controls={controls} probe={probe} />;
    const r = await ReactThreeTestRenderer.create(bare);
    const start = probe.camera!.position.clone();

    await r.update(tree(controls, probe));
    await r.update(tree(controls, probe, { ...PANO, id: 2, position: { x: 0, y: 0, z: 0 }, defaultYaw: 0 }));
    await r.update(bare);

    // Re-entering restores the first panorama before it saves its own state,
    // so the last restore is the one taken before the first panorama opened.
    expect(controls.enableZoom).toBe(true);
    expect(controls.enablePan).toBe(true);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    expect(probe.camera!.position.toArray()).toEqual(start.toArray());

    // And the first panorama's listener is gone with it — otherwise every
    // orbit in the 3D view would still be snapped back to a closed anchor.
    probe.camera!.position.set(9, 9, 9);
    controls.fire("change");
    expect(probe.camera!.position.toArray()).toEqual([9, 9, 9]);
  });
});
