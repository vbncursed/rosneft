import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { BoxGeometry, Group, Mesh, Vector3, type Camera, type PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FreePose } from "../model/free-cam";
import { walkClip } from "../model/walk";
import { fakeControls, WithControls } from "./testing";
import { useWalk, type Walking } from "./use-walk";

const UNIT_RATIO = 10; // 1 scene unit = 10 m: eye 0.18
const noop = () => {};
/** A 2×2×2 box at the origin (top y = 1) under a thin roof slab at y 3…3.2. */
const site = () => {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(2, 2, 2)));
  const roof = new Mesh(new BoxGeometry(2, 0.2, 2));
  roof.position.y = 3.1;
  group.add(roof);
  return { current: group };
};

const out: { walking?: RefObject<Walking | null>; pose?: RefObject<FreePose | null> } = {};
function Probe({ walk, sceneRef, onRefused }: { walk: boolean; sceneRef: { current: Group }; onRefused: () => void }) {
  const pose = useRef<FreePose | null>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  // The rig's flying planes stand in for the camera's: here, the planes the camera had at mount.
  const [flyingPlanes] = useState(() => ({ near: camera.near, far: camera.far }));
  const flying = useCallback(() => flyingPlanes, [flyingPlanes]);
  const walking = useWalk({ walk, unitRatio: UNIT_RATIO, sceneRef, pose, restartSpeed: noop, onRefused, flying });
  useEffect(() => {
    out.walking = walking;
    out.pose = pose;
  });
  return null;
}

const live = new Set<() => Promise<void>>();
async function mount() {
  const controls = fakeControls();
  const probe: { camera?: Camera } = {};
  const sceneRef = site();
  const onRefused = vi.fn();
  const tree = (walk: boolean) => (
    <WithControls controls={controls} probe={probe}>
      <Probe walk={walk} sceneRef={sceneRef} onRefused={onRefused} />
    </WithControls>
  );
  const r = await ReactThreeTestRenderer.create(tree(false));
  live.add(() => r.unmount());
  const camera = probe.camera as PerspectiveCamera;
  return { camera, onRefused, walk: (on: boolean) => r.update(tree(on)) };
}

afterEach(async () => {
  for (const stop of [...live]) await stop();
  live.clear();
});

describe("useWalk", () => {
  it("stands the camera 1.8 m over the ground below it, at rest, with a person's clip", async () => {
    const { camera, walk, onRefused } = await mount();
    const far = camera.far;
    camera.position.set(0.5, 2.5, 0.5);
    await walk(true);
    expect(onRefused).not.toHaveBeenCalled();
    expect(camera.position.toArray().map((v) => +v.toFixed(5))).toEqual([0.5, 1.18, 0.5]);
    expect(camera.near).toBeCloseTo(0.01);
    expect(camera.far).toBe(walkClip(UNIT_RATIO, far).far);
    expect(out.pose?.current?.ground).toBeCloseTo(1);
    expect(out.pose?.current?.velocity.lengthSq()).toBe(0);
  });

  it("refuses when nothing is under the camera, and leaves it where it was", async () => {
    const { camera, walk, onRefused } = await mount();
    const near = camera.near;
    camera.position.set(5, 2.5, 5);
    await walk(true);
    expect(onRefused).toHaveBeenCalledOnce();
    expect(camera.position.y).toBe(2.5);
    expect(camera.near).toBe(near);
    expect(out.walking?.current).toBeNull();
  });

  it("flies again on the spot: the clip back, the pose at rest", async () => {
    const { camera, walk } = await mount();
    const before = { near: camera.near, far: camera.far };
    camera.position.set(0.5, 2.5, 0.5);
    await walk(true);
    out.pose!.current!.velocity.set(0.3, 0, 0);
    const here = camera.position.clone();
    await walk(false);
    expect(camera.near).toBe(before.near);
    expect(camera.far).toBe(before.far);
    expect(camera.position.equals(here)).toBe(true);
    expect(out.pose?.current?.velocity.lengthSq()).toBe(0);
    expect(out.walking?.current).toBeNull();
  });

  it("finds the ground from the height it is given: the floor under the roof", async () => {
    const { camera, walk } = await mount();
    camera.position.set(0.5, 2.5, 0.5); // under the roof
    await walk(true);
    expect(out.walking?.current?.groundAt(0, 0, 2)).toBeCloseTo(1);
    expect(out.walking?.current?.groundAt(0, 0, 10)).toBeCloseTo(3.2);
  });

  it("probes the territory for walls along the way", async () => {
    const { camera, walk } = await mount();
    camera.position.set(0.5, 2.5, 0.5);
    await walk(true);
    // The box's +Z face stands at z = 1: two units from z = 3, at a height inside it.
    const from = new Vector3(0, 0.5, 3);
    const north = new Vector3(0, 0, -1);
    expect(out.walking?.current?.wallAt(from, north, 2.5)).toBe(true);
    expect(out.walking?.current?.wallAt(from, north, 1.5)).toBe(false);
  });
});
