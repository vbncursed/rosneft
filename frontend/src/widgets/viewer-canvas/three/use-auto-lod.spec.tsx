import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useRef } from "react";
import { BoxGeometry, type Camera, type Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LodArtifact, LodChoice } from "@/entities/scene";
import { AutoLodBus, createSettleBus, type Measure } from "./settle-bus";
import { fakeControls, WithControls } from "./testing";
import { SETTLE_MS, useAutoLod } from "./use-auto-lod";

const CHAIN: LodArtifact[] = [
  { lod: 0, hash: "fine", size: 90, faces: 1_000_000 },
  { lod: 2, hash: "coarse", size: 10, faces: 1_000 },
];
const BOX = new BoxGeometry(1, 1, 1); // sphere radius ≈ 0.87 around the origin

// The settle is a setTimeout. Faked, and advanced inside act(), it fires where
// React expects a state update to land — and exactly when the spec says.
const advance = (ms: number) => ReactThreeTestRenderer.act(async () => void vi.advanceTimersByTime(ms));
const settled = () => advance(SETTLE_MS);

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

// Every renderer a test made, unmounted after it: a live one would keep its
// settle armed and its listener on for whichever test runs next.
const mounted: { unmount: () => Promise<void> }[] = [];

/**
 * A real settle bus that counts its live watchers — the hook's one handle on
 * the clock, so the count is what a camera stop costs. Handed to `mount`, it
 * stands in for WithControls' clock, the controls wired to it the same way.
 */
function spyBus() {
  const bus = createSettleBus();
  const spy = {
    ...bus,
    watchers: 0,
    watch(m: Measure) {
      spy.watchers++;
      const unwatch = bus.watch(m);
      return () => {
        spy.watchers--;
        unwatch();
      };
    },
  };
  return spy;
}

async function mount(props: ProbeProps = {}, bus?: ReturnType<typeof spyBus>) {
  const controls = fakeControls();
  if (bus) controls.addEventListener("change", bus.settle);
  const probe: { camera?: Camera } = {};
  const tree = (p: ProbeProps) => (
    <WithControls controls={controls} probe={probe}>
      {bus ? (
        <AutoLodBus value={bus}>
          <Probe {...props} {...p} />
        </AutoLodBus>
      ) : (
        <Probe {...props} {...p} />
      )}
    </WithControls>
  );
  const r = await ReactThreeTestRenderer.create(tree({}), { camera: { position: FAR } });
  mounted.push(r);
  const lod = () => r.scene.findAll((n) => n.instance.name === "probe")[0].instance.userData.lod as number;
  const moveTo = (z: number) => {
    probe.camera!.position.set(0, 0, z);
    controls.fire("change");
  };
  // The test renderer draws no frame on its own; the app's demand loop would
  // draw one for the prop change or the mount that made the object measurable.
  const frame = () => ReactThreeTestRenderer.act(async () => r.advanceFrames(1, 0));
  return { r, lod, moveTo, frame, update: (p: ProbeProps) => r.update(tree(p)) };
}

describe("useAutoLod", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(async () => {
    for (const r of mounted.splice(0)) await r.unmount();
    vi.useRealTimers();
  });

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
    await advance(SETTLE_MS - 1);
    expect(lod()).toBe(2);
    await advance(1);
    expect(lod()).toBe(0);
  });

  it("fetches nothing for a close-up the camera only swept through", async () => {
    const { lod, moveTo } = await mount();
    await settled();
    moveTo(0.5);
    await advance(SETTLE_MS / 2);
    moveTo(1000);
    await settled();
    expect(lod()).toBe(2);
  });

  it("never goes back to a coarser level — the bytes are already paid", async () => {
    const { lod, moveTo } = await mount();
    moveTo(0.5);
    await settled();
    expect(lod()).toBe(0);
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
    await settled();
    expect(lod()).toBe(0);
    moveTo(1000);
    await update({
      chain: [
        { ...CHAIN[0], hash: "fine-2" },
        { ...CHAIN[1], hash: "coarse-2" },
      ],
    });
    expect(lod()).toBe(2);
    await settled();
    expect(lod()).toBe(2);
  });

  it("skips an invisible object, and catches up once it is shown", async () => {
    const { lod, moveTo, update, frame } = await mount({ visible: false });
    moveTo(0.5);
    await settled();
    expect(lod()).toBe(2);
    await update({ visible: true });
    await frame();
    expect(lod()).toBe(0);
  });

  it("picks up an object whose mesh arrives after the camera settled", async () => {
    const { lod, moveTo, update, frame } = await mount({ empty: true });
    moveTo(0.5);
    await settled();
    expect(lod()).toBe(2);
    await update({ empty: false });
    await frame();
    expect(lod()).toBe(0);
  });

  // An idle scene under frameloop="demand" draws nothing, so a poll would be
  // the only thing awake in it.
  it("runs no timer while the object cannot be measured", async () => {
    const { moveTo } = await mount({ visible: false });
    moveTo(0.5);
    expect(vi.getTimerCount()).toBe(1); // the settle debounce
    await advance(SETTLE_MS);
    expect(vi.getTimerCount()).toBe(0);
    await advance(SETTLE_MS * 10);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a pending retry is dropped when leaving Auto", async () => {
    const { lod, moveTo, update, frame } = await mount({ visible: false });
    moveTo(0.5);
    await settled();
    await update({ visible: true, requested: 2 });
    await frame();
    // Back in Auto before the settle re-reads the view: a retry that outlived
    // Auto would have ratcheted the level to 0 already.
    await update({ visible: true, requested: "auto" });
    expect(lod()).toBe(2);
    // Auto resumes as usual: that re-armed settle reads the view.
    await settled();
    expect(lod()).toBe(0);
  });

  it("a camera move takes over a pending retry: nothing is read mid-gesture", async () => {
    const { lod, moveTo, update, frame } = await mount({ visible: false });
    moveTo(0.5);
    await settled();
    await update({ visible: true });
    moveTo(0.5);
    await frame();
    expect(lod()).toBe(2);
    await settled();
    expect(lod()).toBe(0);
  });

  it("keeps the ratchet when the same chain arrives in another order", async () => {
    const { lod, moveTo, update } = await mount();
    moveTo(0.5);
    await settled();
    expect(lod()).toBe(0);
    await update({ chain: [CHAIN[1], CHAIN[0]] });
    expect(lod()).toBe(0);
  });

  // Nothing finer exists, so every camera move would only arm a timer that
  // measures for nothing.
  it("stops watching once the finest level is reached", async () => {
    const bus = spyBus();
    const { lod, moveTo } = await mount({}, bus);
    expect(bus.watchers).toBe(1);
    moveTo(0.5);
    await settled();
    expect(lod()).toBe(0);
    // The level lands at commit and the watch goes in the passive-effect
    // cleanup after it; act() flushes both before the settle returns.
    expect(bus.watchers).toBe(0);
  });

  it("does not watch in Auto when a manual pick already reached the finest level", async () => {
    const bus = spyBus();
    const { update } = await mount({ requested: 0 }, bus);
    await update({ requested: "auto" });
    expect(bus.watchers).toBe(0);
  });

  it("watches only while in Auto, and lets go on unmount", async () => {
    const bus = spyBus();
    const { r, update } = await mount({ requested: 1 }, bus);
    expect(bus.watchers).toBe(0);
    await update({ requested: "auto" });
    expect(bus.watchers).toBe(1);
    await r.unmount();
    expect(bus.watchers).toBe(0);
  });
});
