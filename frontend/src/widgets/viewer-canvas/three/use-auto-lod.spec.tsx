import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useRef } from "react";
import { BoxGeometry, type Camera, type Group } from "three";
import { describe, expect, it, vi } from "vitest";
import type { LodArtifact, LodChoice } from "@/entities/scene";
import { fakeControls, WithControls } from "./testing";
import { SETTLE_MS, useAutoLod } from "./use-auto-lod";

const CHAIN: LodArtifact[] = [
  { lod: 0, hash: "fine", size: 90, faces: 1_000_000 },
  { lod: 2, hash: "coarse", size: 10, faces: 1_000 },
];
const BOX = new BoxGeometry(1, 1, 1); // sphere radius ≈ 0.87 around the origin
const settled = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 60));

type ProbeProps = { chain?: LodArtifact[]; requested?: LodChoice; visible?: boolean; empty?: boolean };

// The level is stamped on the group's userData so the spec reads it off the
// scene instead of mutating a prop during render.
function Probe({ chain = CHAIN, requested = "auto", visible = true, empty = false }: ProbeProps) {
  const ref = useRef<Group>(null);
  const lod = useAutoLod(ref, chain, requested);
  return (
    <group ref={ref} name="probe" visible={visible} userData={{ lod }}>
      {empty ? null : <mesh geometry={BOX} />}
    </group>
  );
}

// Far away the box is a pixel or two on any canvas; inside its sphere the area
// is unbounded. Neither depends on the test canvas's size.
const FAR = [0, 0, 1000] as [number, number, number];

async function mount(props: ProbeProps = {}) {
  const controls = fakeControls();
  const probe: { camera?: Camera } = {};
  const tree = (p: ProbeProps) => (
    <WithControls controls={controls} probe={probe}>
      <Probe {...props} {...p} />
    </WithControls>
  );
  const r = await ReactThreeTestRenderer.create(tree({}), { camera: { position: FAR } });
  const lod = () => r.scene.findAll((n) => n.instance.name === "probe")[0].instance.userData.lod as number;
  const moveTo = (z: number) => {
    probe.camera!.position.set(0, 0, z);
    controls.fire("change");
  };
  return { r, controls, lod, moveTo, update: (p: ProbeProps) => r.update(tree(p)) };
}

describe("useAutoLod", () => {
  it("starts at the coarsest level and stays there while the object is small on screen", async () => {
    const { lod } = await mount();
    expect(lod()).toBe(2);
    await settled();
    expect(lod()).toBe(2);
  });

  it("re-reads the view only once the camera has held still", async () => {
    const { lod, moveTo } = await mount();
    await settled();
    moveTo(0.5);
    expect(lod()).toBe(2);
    await vi.waitFor(() => expect(lod()).toBe(0));
  });

  it("fetches nothing for a close-up the camera only swept through", async () => {
    const { lod, moveTo } = await mount();
    await settled();
    moveTo(0.5);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS / 2));
    moveTo(1000);
    await settled();
    expect(lod()).toBe(2);
  });

  it("never goes back to a coarser level — the bytes are already paid", async () => {
    const { lod, moveTo } = await mount();
    moveTo(0.5);
    await vi.waitFor(() => expect(lod()).toBe(0));
    moveTo(1000);
    await settled();
    expect(lod()).toBe(0);
  });

  it("returns a numeric request as is, and keeps the finer one once Auto resumes", async () => {
    const { lod, update } = await mount({ requested: 0 });
    expect(lod()).toBe(0);
    await update({ requested: 2 });
    expect(lod()).toBe(2);
    await update({ requested: "auto" });
    await settled();
    // Measure forced LOD 0 earlier; far away, Auto still does not drop it.
    expect(lod()).toBe(0);
  });

  it("starts over from the coarsest level of a new chain", async () => {
    const { lod, moveTo, update } = await mount();
    moveTo(0.5);
    await vi.waitFor(() => expect(lod()).toBe(0));
    moveTo(1000);
    await update({ chain: [{ ...CHAIN[0], hash: "fine-2" }, { ...CHAIN[1], hash: "coarse-2" }] });
    expect(lod()).toBe(2);
    await settled();
    expect(lod()).toBe(2);
  });

  it("skips an invisible object, and catches up once it is shown", async () => {
    const { lod, moveTo, update } = await mount({ visible: false });
    moveTo(0.5);
    await settled();
    expect(lod()).toBe(2);
    await update({ visible: true });
    await vi.waitFor(() => expect(lod()).toBe(0));
  });

  it("picks up an object whose mesh arrives after the camera settled", async () => {
    const { lod, moveTo, update } = await mount({ empty: true });
    moveTo(0.5);
    await settled();
    expect(lod()).toBe(2);
    await update({ empty: false });
    await vi.waitFor(() => expect(lod()).toBe(0));
  });

  // Nothing finer exists, so every camera move would only arm a timer that
  // measures for nothing.
  it("stops listening once the finest level is reached", async () => {
    const { controls, lod, moveTo } = await mount();
    expect(controls.listeners.get("change")?.size).toBe(1);
    moveTo(0.5);
    await vi.waitFor(() => expect(lod()).toBe(0));
    expect(controls.listeners.get("change")?.size ?? 0).toBe(0);
  });

  it("does not listen in Auto when a manual pick already reached the finest level", async () => {
    const { controls, update } = await mount({ requested: 0 });
    await update({ requested: "auto" });
    expect(controls.listeners.get("change")?.size ?? 0).toBe(0);
  });

  it("listens only while in Auto, and lets go on unmount", async () => {
    const { r, controls, update } = await mount({ requested: 1 });
    expect(controls.listeners.get("change")?.size ?? 0).toBe(0);
    await update({ requested: "auto" });
    expect(controls.listeners.get("change")?.size).toBe(1);
    await r.unmount();
    expect(controls.listeners.get("change")?.size).toBe(0);
  });
});
