import ReactThreeTestRenderer from "@react-three/test-renderer";
import { Group, type Camera } from "three";
import { describe, expect, it, vi } from "vitest";
import PanoramaDragController from "./panorama-drag-controller";
import { fakeControls, fakeScene, WithControls } from "./testing";

// The test renderer's canvas is 1280 × 800 at the viewport origin, and its
// camera sits at (0, 0, 5) looking down -Z. A pointer at the canvas centre is
// therefore NDC (0, 0) and its ray meets the unit box's front face at z = 0.5.
const CENTRE = { clientX: 640, clientY: 400 };
const CORNER = { clientX: 4, clientY: 4 };

const pointer = (type: string, at: { clientX: number; clientY: number }) =>
  window.dispatchEvent(new MouseEvent(type, { ...at, bubbles: true }));

const mount = async (over: Partial<Parameters<typeof PanoramaDragController>[0]> = {}) => {
  const controls = fakeControls();
  const territoryRef = { current: fakeScene() };
  const onMove = vi.fn();
  const onEnd = vi.fn();
  const renderer = await ReactThreeTestRenderer.create(
    <WithControls controls={controls}>
      <PanoramaDragController
        dragging
        territoryRef={territoryRef}
        onMove={onMove}
        onEnd={onEnd}
        {...over}
      />
    </WithControls>,
  );
  return { renderer, controls, territoryRef, onMove, onEnd };
};

describe("PanoramaDragController", () => {
  it("suspends the orbit while a marker is held, and hands the controls back on unmount", async () => {
    const { renderer, controls } = await mount();
    expect(controls.enabled).toBe(false);
    await ReactThreeTestRenderer.act(async () => {
      renderer.unmount();
    });
    expect(controls.enabled).toBe(true);
  });

  it("stops the orbit's leftover inertia where the view stands when a marker is grabbed", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    controls.target.set(1, 1, 1);
    controls.update.mockImplementation(() => {
      probe.camera!.position.x += 5;
      controls.target.x += 5;
    });
    const renderer = await ReactThreeTestRenderer.create(
      <WithControls controls={controls} probe={probe}>
        <PanoramaDragController dragging={false} territoryRef={{ current: fakeScene() }} onMove={vi.fn()} onEnd={vi.fn()} />
      </WithControls>,
    );
    const before = probe.camera!.position.toArray();
    await renderer.update(
      <WithControls controls={controls} probe={probe}>
        <PanoramaDragController dragging territoryRef={{ current: fakeScene() }} onMove={vi.fn()} onEnd={vi.fn()} />
      </WithControls>,
    );
    expect(controls.update).toHaveBeenCalled();
    expect(probe.camera!.position.toArray()).toEqual(before);
    expect(controls.target.toArray()).toEqual([1, 1, 1]);
  });

  it("leaves the orbit alone when nothing is being dragged", async () => {
    const { controls, onMove } = await mount({ dragging: false });
    expect(controls.enabled).toBe(true);
    pointer("pointermove", CENTRE);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("reports the territory surface point under the cursor", async () => {
    const { onMove } = await mount();
    pointer("pointermove", CENTRE);
    expect(onMove).toHaveBeenCalledWith({ x: 0, y: 0, z: 0.5 });
  });

  it("leaves the marker where it is when the ray misses the territory", async () => {
    const { onMove } = await mount();
    pointer("pointermove", CORNER);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("reports nothing while the territory has not loaded", async () => {
    const { onMove, territoryRef } = await mount();
    territoryRef.current = null as unknown as Group;
    pointer("pointermove", CENTRE);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("ends the drag on a release anywhere, not only over the mesh", async () => {
    const { onEnd } = await mount();
    pointer("pointerup", CORNER);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stops listening once the drag is over", async () => {
    const { renderer, onEnd, onMove, territoryRef } = await mount();
    await ReactThreeTestRenderer.act(async () => {
      renderer.update(
        <WithControls controls={fakeControls()}>
          <PanoramaDragController
            dragging={false}
            territoryRef={territoryRef}
            onMove={onMove}
            onEnd={onEnd}
          />
        </WithControls>,
      );
    });
    pointer("pointermove", CENTRE);
    pointer("pointerup", CENTRE);
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
