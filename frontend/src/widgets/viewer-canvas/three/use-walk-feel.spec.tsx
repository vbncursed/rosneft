import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useEffect } from "react";
import { Vector3, type Camera, type PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FreeInput, FreePose } from "../model/free-cam";
import { fakeControls, WithControls } from "./testing";
import { easeFovHome, stopFovHome, useWalkFeel, type WalkFeel } from "./use-walk-feel";

// The model has no source of a view kick yet: this seam gives the spring one, so the
// re-entry test can take a kick into flight. Every other frame is the real stepFeel.
const kick = vi.hoisted(() => ({ deg: 0 }));
vi.mock("../model/walk-feel", async (orig) => {
  const real = await orig<typeof import("../model/walk-feel")>();
  return {
    ...real,
    stepFeel: (...args: Parameters<typeof real.stepFeel>) => {
      const next = real.stepFeel(...args);
      return kick.deg ? { ...next, fov: { x: kick.deg, v: 0 } } : next;
    },
  };
});

const UNIT_RATIO = 10; // 1 scene unit = 10 m: eye 0.18
const go: FreeInput = { forward: 0, right: 0, up: 0, boost: false, jump: false, instant: false };
const at = (y: number, x = 0, z = 0): FreePose => ({
  position: new Vector3(x, y, z),
  yaw: 0,
  pitch: 0,
  velocity: new Vector3(),
});

const out: { feel?: WalkFeel } = {};
function Probe() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const feel = useWalkFeel(camera, UNIT_RATIO);
  useEffect(() => {
    out.feel = feel;
  });
  return null;
}

function Harness({ on, controls, probe }: { on: boolean; controls: unknown; probe: { camera?: Camera } }) {
  return (
    <WithControls controls={controls} probe={probe}>
      {on ? <Probe /> : null}
    </WithControls>
  );
}

const live = new Set<() => Promise<void>>();
async function mount() {
  const probe: { camera?: Camera } = {};
  const r = await ReactThreeTestRenderer.create(
    <WithControls controls={fakeControls()} probe={probe}>
      <Probe />
    </WithControls>,
  );
  live.add(() => r.unmount());
  return { camera: probe.camera as PerspectiveCamera, feel: out.feel!, unmount: () => r.unmount() };
}

/** rAF held in a queue: `tick(n)` runs n frames 16 ms apart. */
function frames() {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => queue.splice(0));
  let now = 0;
  return {
    queue,
    tick: (n: number) => {
      for (let i = 0; i < n && queue.length > 0; i++) queue.shift()!((now += 16));
    },
  };
}

afterEach(async () => {
  for (const stop of [...live]) await stop();
  live.clear();
  stopFovHome();
  vi.unstubAllGlobals();
});

describe("useWalkFeel", () => {
  it("shows a pose as it is while nothing moves", async () => {
    const { feel } = await mount();
    const pose = at(0.18);
    expect(feel.shown(pose)).toBe(pose);
    expect(feel.live()).toBe(false);
  });

  it("shows a snapped step under the body, and eases the camera up to it", async () => {
    const { camera, feel } = await mount();
    const low = at(0.18);
    const high = at(0.21); // a 0.3 m step at 10 m a unit
    feel.step(low, high, go, 1 / 60, true);
    feel.apply(high);
    expect(camera.position.y).toBeLessThan(0.21);
    expect(feel.live()).toBe(true);
    for (let i = 0; i < 60; i++) feel.step(high, high, go, 1 / 60, true);
    feel.apply(high);
    expect(camera.position.y).toBe(0.21);
    expect(feel.live()).toBe(false);
  });

  it("ends a walk with the pose where the eye was: nothing on screen moves", async () => {
    const { camera, feel } = await mount();
    feel.step(at(0.18), at(0.21), go, 1 / 60, true);
    feel.apply(at(0.21));
    const shownY = camera.position.y;
    const kept = feel.step(at(0.21), at(0.21), go, 1 / 60, false);
    expect(kept.position.y).toBe(shownY);
    expect(feel.shown(kept)).toBe(kept);
    feel.apply(kept);
    expect(camera.position.y).toBe(shownY);
  });

  it("a walk that ends on a frame of no time moves nothing, on that frame or the next", async () => {
    const { camera, feel } = await mount();
    feel.step(at(0.18, 1, 2), at(0.21, 1, 2), go, 1 / 60, true);
    feel.apply(at(0.21, 1, 2));
    const before = camera.position.toArray();
    const body = at(0.21, 1, 2);
    feel.apply(feel.step(body, body, go, 0, false));
    expect(camera.position.toArray()).toEqual(before);
    feel.apply(feel.step(body, body, go, 1 / 60, false));
    expect(camera.position.toArray()).toEqual(before);
  });

  it("drops the offset on rest: the camera was moved from outside", async () => {
    const { feel } = await mount();
    feel.step(at(0.18), at(0.21), go, 1 / 60, true);
    feel.rest();
    const pose = at(0.21);
    expect(feel.shown(pose)).toBe(pose);
  });
});

describe("easeFovHome", () => {
  it("brings the view home on its own frames, asking for each, then stops", async () => {
    const { camera } = await mount();
    const raf = frames();
    const invalidate = vi.fn();
    camera.fov = 53;
    easeFovHome(camera, 50, { x: 3, v: 0 }, invalidate);
    raf.tick(3);
    expect(camera.fov).toBeLessThan(53);
    expect(camera.fov).toBeGreaterThan(50);
    raf.tick(400);
    expect(camera.fov).toBe(50);
    expect(raf.queue).toHaveLength(0);
    expect(invalidate).toHaveBeenCalled();
  });

  it("a free cam entered again on the same camera before the view is home starts from the base", async () => {
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    const r = await ReactThreeTestRenderer.create(<Harness on controls={controls} probe={probe} />);
    live.add(() => r.unmount());
    const camera = probe.camera as PerspectiveCamera;
    const base = camera.fov;

    kick.deg = 3;
    out.feel!.step(at(0.18), at(0.18), go, 1 / 60, true);
    kick.deg = 0;
    out.feel!.apply(at(0.18));
    expect(camera.fov).toBe(base + 3);

    const raf = frames();
    await r.update(<Harness on={false} controls={controls} probe={probe} />);
    raf.tick(2);
    expect(camera.fov).toBeGreaterThan(base);
    expect(camera.fov).toBeLessThan(base + 3);

    await r.update(<Harness on controls={controls} probe={probe} />); // ends the release first, at home
    expect(camera.fov).toBe(base);
    out.feel!.apply(at(0.18));
    expect(camera.fov).toBe(base);
    raf.tick(50);
    expect(camera.fov).toBe(base);
  });
});
