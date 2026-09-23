import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Vector3,
  type PerspectiveCamera,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESCEND_S, HOLD_S, RISE_S, fitDistance } from "../model/flight-pose";
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

// Module-level so a re-render hands the rig the same identities.
const noop = () => {};
const NO_SCENE = { current: null };

type Flying = { playing?: boolean; onPlayStop?: () => void; sceneRef?: { current: Group | null } };

const rig = (resetVersion: number, f: Flying = {}) => (
  <>
    <CameraRig
      resetVersion={resetVersion}
      playing={f.playing ?? false}
      onPlayStop={f.onPlayStop ?? noop}
      sceneRef={f.sceneRef ?? NO_SCENE}
    />
    <Probe />
  </>
);

/** A territory at the origin made of `geometry`, alone in its group. */
const holding = (geometry: BufferGeometry) => {
  const group = new Group();
  group.add(new Mesh(geometry));
  return { current: group };
};

/** A 2×2×2 territory at the origin: its bounding sphere is centred there, radius √3. */
const territory = () => holding(new BoxGeometry(2, 2, 2));

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
    expect(camera!.position.x).toBeCloseTo(9);

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

describe("CameraRig · fly-around", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.querySelectorAll("[data-canvas-cover]").forEach((el) => el.remove());
  });

  /**
   * A frame clock the test turns: `at(ms)` runs every frame asked for so far,
   * as one frame; `to(ms)` walks there in 16 ms frames, the way a display does
   * (the flight's clock takes at most 100 ms from any one frame).
   */
  const stubFrames = () => {
    const queued = new Map<number, FrameRequestCallback>();
    let id = 0;
    let now: number | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queued.set(++id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (n: number) => queued.delete(n));
    const at = (ms: number) => {
      now = ms;
      const due = [...queued.values()];
      queued.clear();
      for (const cb of due) cb(ms);
    };
    return {
      queued,
      at,
      to: (ms: number) => {
        if (now === null) return at(ms);
        while (now < ms) at(Math.min(now + 16, ms));
      },
    };
  };

  const upness = () => camera!.position.y / camera!.position.length();

  // E6: a hidden tab gets no frames, and a long task delays one; either way
  // the flight picks up where it was instead of jumping by the time away.
  it("slows the flight over a lost frame rather than skipping ahead", async () => {
    const late = stubFrames();
    const a = await ReactThreeTestRenderer.create(rig(0, { playing: true, sceneRef: territory() }));
    late.at(1000);
    late.at(6000);
    const resumed = camera!.position.clone();
    await a.unmount();
    vi.unstubAllGlobals();

    const steady = stubFrames();
    await ReactThreeTestRenderer.create(rig(0, { playing: true, sceneRef: territory() }));
    steady.at(1000);
    steady.at(1100);
    expect(camera!.position.distanceTo(resumed)).toBeLessThan(1e-9);
  });

  // E7: the open Overlays panel marks itself; the flight centres the
  // territory in what the panel leaves of the canvas, and follows a fold.
  it("circles beside the open Overlays panel, and recentres once it folds", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1280 } as DOMRect);
    const cover = document.body.appendChild(document.createElement("div"));
    cover.setAttribute("data-canvas-cover", "");
    vi.spyOn(cover, "getBoundingClientRect").mockReturnValue({ left: 960 } as DOMRect);
    const ndcX = () => {
      camera!.updateMatrixWorld();
      return new Vector3().project(camera!).x;
    };
    const frames = stubFrames();
    await ReactThreeTestRenderer.create(rig(0, { playing: true, sceneRef: territory() }));
    frames.to(1000);
    frames.to(1000 + (RISE_S + HOLD_S + DESCEND_S) * 1000 + 500);
    expect(ndcX()).toBeCloseTo(-320 / 1280, 6);

    cover.remove();
    frames.to(1000 + (RISE_S + HOLD_S + DESCEND_S) * 1000 + 3000);
    expect(ndcX()).toBeCloseTo(0, 4);
  });

  it("rises over the territory's centre, then circles it at 45°", async () => {
    const frames = stubFrames();
    await ReactThreeTestRenderer.create(rig(0, { playing: true, sceneRef: territory() }));
    frames.to(1000); // the first frame is t = 0
    frames.to(1000 + RISE_S * 1000);
    // 30 % closer than the fit, all the way round.
    const distance = 0.7 * fitDistance(Math.sqrt(3), camera!.fov, camera!.aspect);
    expect(controls!.target.length()).toBeLessThan(1e-9);
    expect(camera!.position.length()).toBeCloseTo(distance, 6);
    expect(upness()).toBeGreaterThan(0.9999);

    frames.to(1000 + (RISE_S + HOLD_S + DESCEND_S) * 1000 + 5000);
    expect(upness()).toBeCloseTo(Math.SQRT1_2, 6);
    expect(camera!.position.length()).toBeCloseTo(distance, 6);
  });

  it("stops where the reader grabs the view, and says so once", async () => {
    const frames = stubFrames();
    const onPlayStop = vi.fn();
    await ReactThreeTestRenderer.create(rig(0, { playing: true, onPlayStop, sceneRef: territory() }));
    frames.to(1000);
    frames.to(1600);
    // Pointer, wheel and touch all open with "start" in three-stdlib.
    controls!.dispatchEvent({ type: "start" } as never);
    expect(onPlayStop).toHaveBeenCalledOnce();
    const caught = camera!.position.clone();
    frames.to(9000);
    expect(camera!.position.distanceTo(caught)).toBeLessThan(1e-6);
    controls!.dispatchEvent({ type: "start" } as never);
    expect(onPlayStop).toHaveBeenCalledOnce();
  });

  it("hands the camera over when a gizmo or a marker drag takes the controls", async () => {
    // Those switch the controls off rather than firing "start".
    const frames = stubFrames();
    const onPlayStop = vi.fn();
    await ReactThreeTestRenderer.create(rig(0, { playing: true, onPlayStop, sceneRef: territory() }));
    frames.to(1000);
    frames.to(1600);
    const caught = camera!.position.clone();
    controls!.enabled = false;
    frames.to(2200);
    expect(onPlayStop).toHaveBeenCalledOnce();
    expect(camera!.position.distanceTo(caught)).toBeLessThan(1e-6);
  });

  it.each([
    ["a grab", () => controls!.dispatchEvent({ type: "start" } as never)],
    ["the toggle", "toggle"],
  ] as const)(
    "leaves the orbit pivoting on the territory when %s stops it mid-rise",
    async (_, how) => {
      // Looking level at a point far past the centre: mid-rise, the flight's
      // own target is then well below the ground.
      const frames = stubFrames();
      const sceneRef = territory();
      const r = await ReactThreeTestRenderer.create(rig(0, { sceneRef }));
      controls!.target.set(0, 0, -20);
      controls!.update();
      await r.update(rig(0, { playing: true, sceneRef }));
      frames.to(1000);
      frames.to(1000 + (RISE_S / 2) * 1000);
      expect(controls!.target.y).toBeLessThan(-2);
      const view = camera!.getWorldDirection(new Vector3());

      if (how === "toggle") await r.update(rig(0, { playing: false, sceneRef }));
      else how();

      // Nearer the centre than its own radius, and on the view ray: the
      // reader's view does not move when the orbit takes over.
      expect(controls!.target.length()).toBeLessThan(Math.sqrt(3));
      const toTarget = controls!.target.clone().sub(camera!.position).normalize();
      expect(toTarget.distanceTo(view)).toBeLessThan(1e-9);
    },
  );

  it("lands on Reset: the camera goes back where it started and nothing moves it after", async () => {
    const frames = stubFrames();
    const sceneRef = territory();
    const r = await ReactThreeTestRenderer.create(rig(0, { playing: true, sceneRef }));
    const start = camera!.position.clone();
    frames.to(1000);
    frames.to(1600);
    expect(camera!.position.distanceTo(start)).toBeGreaterThan(0.01);

    // The page turns Play off and bumps resetVersion in one render.
    await r.update(rig(1, { playing: false, sceneRef }));
    frames.to(5000);
    expect(camera!.position.distanceTo(start)).toBeLessThan(1e-6);
  });

  it.each([
    ["no mesh at all", () => ({ current: new Group() })],
    ["a mesh with no size", () => holding(new BoxGeometry(0, 0, 0))],
    [
      "a mesh with no finite bounds",
      () =>
        holding(
          new BufferGeometry().setAttribute(
            "position",
            new Float32BufferAttribute([Infinity, 0, 0, -Infinity, 0, 0], 3),
          ),
        ),
    ],
  ])("stops at once, moving nothing, with %s to circle", async (_, sceneRef) => {
    const frames = stubFrames();
    const onPlayStop = vi.fn();
    await ReactThreeTestRenderer.create(rig(0, { playing: true, onPlayStop, sceneRef: sceneRef() }));
    const before = camera!.position.clone();
    frames.to(1000);
    expect(onPlayStop).toHaveBeenCalledOnce();
    expect(camera!.position.distanceTo(before)).toBeLessThan(1e-6);
  });

  it("leaves no frame running once it unmounts", async () => {
    const frames = stubFrames();
    const r = await ReactThreeTestRenderer.create(rig(0, { playing: true, sceneRef: territory() }));
    frames.to(1000);
    await r.unmount();
    expect(frames.queued.size).toBe(0);
  });

  it("skips the fly-in under reduced motion: at 45° from the first frame", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    const frames = stubFrames();
    await ReactThreeTestRenderer.create(rig(0, { playing: true, sceneRef: territory() }));
    frames.to(1000);
    expect(upness()).toBeCloseTo(Math.SQRT1_2, 6);
    expect(controls!.target.length()).toBeLessThan(1e-9);
  });
});
