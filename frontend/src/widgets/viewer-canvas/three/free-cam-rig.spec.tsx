import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useEffect, type ReactNode } from "react";
import { BoxGeometry, Euler, Group, Mesh, Vector3, type Camera, type Object3D, type PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clipPlanes } from "../model/free-cam";
import FreeCamRig from "./free-cam-rig";
import { SETTLE_MS, useAutoLodBus } from "./settle-bus";
import { fakeControls, waitInAct, WithControls } from "./testing";

let canvas: HTMLCanvasElement;
function CanvasProbe() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    canvas = gl.domElement;
  }, [gl]);
  return null;
}

const measures = vi.fn(() => true);
function BusProbe() {
  const bus = useAutoLodBus();
  useEffect(() => bus.watch(measures), [bus]);
  return null;
}

/** A 2×2×2 territory at the origin: bounding sphere radius √3. */
const territory = () => {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(2, 2, 2)));
  return { current: group };
};

const UNIT_RATIO = 10; // 1 scene unit = 10 m: eye 0.18, walk 0.14 u/s, run 0.4 u/s
const noop = () => {};

const scene = (
  controls: ReturnType<typeof fakeControls>,
  probe: { camera?: Camera },
  sceneRef: { current: Group },
  rig: boolean,
  walk = false,
  onWalkRefused: () => void = noop,
  solidRef: { current: Object3D } = sceneRef,
): ReactNode => (
  <WithControls controls={controls} probe={probe}>
    {rig ? (
      <FreeCamRig
        sceneRef={sceneRef}
        solidRef={solidRef}
        walk={walk}
        unitRatio={UNIT_RATIO}
        onWalkRefused={onWalkRefused}
      />
    ) : null}
    <CanvasProbe />
    <BusProbe />
  </WithControls>
);

// Every renderer a test leaves up is unmounted after it: a live rig keeps its
// window listeners, and they would fly the camera in the next test.
const live = new Set<() => Promise<void>>();

async function mount(rig = true, sceneRef = territory(), solidRef = sceneRef) {
  const controls = fakeControls();
  const probe: { camera?: Camera } = {};
  const r = await ReactThreeTestRenderer.create(scene(controls, probe, sceneRef, rig, false, noop, solidRef));
  const camera = probe.camera as PerspectiveCamera;
  const frames = (n: number) => ReactThreeTestRenderer.act(async () => r.advanceFrames(n, 0.05));
  const key = (type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
    ReactThreeTestRenderer.act(async () => {
      target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, ...init }));
    });
  const pointer = (type: string, init: PointerEventInit) =>
    ReactThreeTestRenderer.act(async () => {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, buttons: 1, ...init }));
    });
  const wheel = (deltaY: number) =>
    ReactThreeTestRenderer.act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaY, cancelable: true, bubbles: true }));
    });
  const stop = async () => {
    if (live.delete(stop)) await r.unmount();
  };
  live.add(stop);
  const walkTo = (walk: boolean, refused?: () => void) =>
    r.update(scene(controls, probe, sceneRef, true, walk, refused, solidRef));
  return { r, controls, camera, sceneRef, probe, frames, key, pointer, wheel, walkTo, unmount: stop };
}

afterEach(async () => {
  for (const stop of [...live]) await stop();
  vi.unstubAllGlobals();
  measures.mockClear();
  document.body.replaceChildren();
});

const reducedMotion = () =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );

describe("FreeCamRig", () => {
  it("takes the orbit aside and clips the view to the territory", async () => {
    const { controls, camera } = await mount();
    expect(controls.enabled).toBe(false);
    expect(camera.far / camera.near).toBeCloseTo(10_000, 0);
    expect(camera.near).toBeLessThan(0.01);
  });

  it("flies along the line of sight while W is held, and stops on release", async () => {
    reducedMotion();
    const { camera, key, frames } = await mount();
    const start = camera.position.clone();
    await key("keydown", "KeyW");
    await frames(4);
    expect(camera.position.z).toBeLessThan(start.z);
    expect(camera.position.x).toBeCloseTo(start.x);
    expect(camera.position.y).toBeCloseTo(start.y);

    await key("keyup", "KeyW");
    const stopped = camera.position.clone();
    await frames(3);
    expect(camera.position.equals(stopped)).toBe(true);
  });

  it("flies without touching the orbit's update", async () => {
    reducedMotion();
    const { controls, key, frames } = await mount();
    controls.update.mockClear();
    await key("keydown", "KeyW");
    await frames(4);
    expect(controls.update).not.toHaveBeenCalled();
  });

  it("hands the orbit back without a jump, pivoted on the line of sight", async () => {
    reducedMotion();
    const controls = fakeControls();
    const probe: { camera?: Camera } = {};
    const sceneRef = territory();
    const r = await ReactThreeTestRenderer.create(scene(controls, probe, sceneRef, false));
    const camera = probe.camera as PerspectiveCamera;
    const before = { near: camera.near, far: camera.far };

    await r.update(scene(controls, probe, sceneRef, true));
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
    });
    await ReactThreeTestRenderer.act(async () => r.advanceFrames(4, 0.05));
    const pos = camera.position.clone();
    const sight = camera.getWorldDirection(new Vector3());

    await r.update(scene(controls, probe, sceneRef, false));
    expect(controls.enabled).toBe(true);
    expect(controls.update).toHaveBeenCalled();
    expect(camera.position.equals(pos)).toBe(true);
    const aim = controls.target.clone().sub(pos).normalize();
    for (const axis of ["x", "y", "z"] as const) expect(aim[axis]).toBeCloseTo(sight[axis], 5);
    expect(camera.near).toBe(before.near);
    expect(camera.far).toBe(before.far);
  });

  it("flies from where the camera is now, when something moved it after the rig took its pose", async () => {
    reducedMotion();
    const { camera, key, frames } = await mount();
    // drei's Bounds fit moves the camera after the rig has taken its pose.
    camera.position.x += 5;
    camera.quaternion.setFromEuler(new Euler(0, 0.5, 0, "YXZ"));
    await key("keydown", "KeyW");
    const start = camera.position.clone();
    await frames(4);
    expect(camera.position.distanceTo(start)).toBeLessThan(1);
  });

  it("ignores keys with a modifier, typed into a field, or under an open dialog", async () => {
    reducedMotion();
    const { camera, key, frames } = await mount();
    const start = camera.position.clone();

    await key("keydown", "KeyW", { metaKey: true });
    await frames(4);
    expect(camera.position.equals(start)).toBe(true);

    const input = document.createElement("input");
    document.body.append(input);
    await key("keydown", "KeyW", {}, input);
    await frames(4);
    expect(camera.position.equals(start)).toBe(true);

    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    await key("keydown", "KeyW");
    await frames(4);
    expect(camera.position.equals(start)).toBe(true);
  });

  it("stops flying on a ⌘ press: macOS sends no keyup for the keys still held", async () => {
    reducedMotion();
    const { camera, key, frames } = await mount();
    await key("keydown", "KeyW");
    await frames(2);
    await key("keydown", "MetaLeft", { key: "Meta", metaKey: true });
    const stopped = camera.position.clone();
    await frames(4);
    expect(camera.position.equals(stopped)).toBe(true);
  });

  it("stops flying when the window loses focus with a key still held", async () => {
    reducedMotion();
    const { camera, key, frames } = await mount();
    await key("keydown", "KeyW");
    await ReactThreeTestRenderer.act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    const start = camera.position.clone();
    await frames(4);
    expect(camera.position.equals(start)).toBe(true);
  });

  it("looks only after the press passes the click slop, and sets the cursor to match", async () => {
    reducedMotion();
    const { camera, pointer } = await mount();
    const q = camera.quaternion.clone();
    expect(canvas.style.cursor).toBe("grab");

    await pointer("pointerdown", { button: 0, clientX: 100, clientY: 100 });
    await pointer("pointermove", { clientX: 103, clientY: 100 });
    expect(camera.quaternion.equals(q)).toBe(true);
    expect(canvas.style.cursor).toBe("grab");

    await pointer("pointermove", { clientX: 140, clientY: 100 });
    expect(camera.quaternion.equals(q)).toBe(false);
    expect(canvas.style.cursor).toBe("grabbing");

    await pointer("pointerup", { button: 0, clientX: 140, clientY: 100 });
    expect(canvas.style.cursor).toBe("grab");
  });

  it("stops looking when a move arrives with no button down, the release having gone missing", async () => {
    reducedMotion();
    const { camera, pointer } = await mount();
    const q = camera.quaternion.clone();
    await pointer("pointerdown", { button: 0, clientX: 100, clientY: 100 });
    await pointer("pointermove", { buttons: 0, clientX: 160, clientY: 100 });
    expect(camera.quaternion.equals(q)).toBe(true);
    await pointer("pointermove", { buttons: 0, clientX: 220, clientY: 100 });
    expect(camera.quaternion.equals(q)).toBe(true);
    expect(canvas.style.cursor).toBe("grab");
  });

  it("looks with the right button too, and not with the middle one", async () => {
    reducedMotion();
    const { camera, pointer } = await mount();
    const q = camera.quaternion.clone();
    await pointer("pointerdown", { button: 1, clientX: 100, clientY: 100 });
    await pointer("pointermove", { clientX: 160, clientY: 100 });
    expect(camera.quaternion.equals(q)).toBe(true);
    await pointer("pointerup", { button: 1, clientX: 160, clientY: 100 });

    await pointer("pointerdown", { button: 2, clientX: 100, clientY: 100 });
    await pointer("pointermove", { clientX: 160, clientY: 100 });
    expect(camera.quaternion.equals(q)).toBe(false);
  });

  it("keeps the context menu and the wheel from the page, and the wheel sets the speed", async () => {
    reducedMotion();
    const { unmount } = await mount();
    const menu = new MouseEvent("contextmenu", { cancelable: true, bubbles: true });
    canvas.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    const notch = new WheelEvent("wheel", { deltaY: -300, cancelable: true, bubbles: true });
    canvas.dispatchEvent(notch);
    expect(notch.defaultPrevented).toBe(true);
    await unmount();

    const flownDistance = async (scrolled: boolean) => {
      const m = await mount();
      if (scrolled) canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, cancelable: true, bubbles: true }));
      const start = m.camera.position.clone();
      await m.key("keydown", "KeyW");
      await m.frames(4);
      await m.key("keyup", "KeyW");
      const distance = m.camera.position.distanceTo(start);
      await m.unmount();
      return distance;
    };
    expect(await flownDistance(true)).toBeGreaterThan(await flownDistance(false));
  });

  it("takes the orbit back from whatever handed it over, on press or wheel", async () => {
    const { controls, pointer, wheel } = await mount();
    controls.enabled = true;
    await pointer("pointerdown", { button: 0, clientX: 1, clientY: 1 });
    expect(controls.enabled).toBe(false);

    controls.enabled = true;
    await wheel(100);
    expect(controls.enabled).toBe(false);
  });

  it("re-reads Auto LOD after a flight and after a look", async () => {
    reducedMotion();
    const { key, frames, pointer } = await mount();
    await waitInAct(SETTLE_MS + 50);
    measures.mockClear();

    await key("keydown", "KeyW");
    await frames(2);
    await key("keyup", "KeyW");
    await waitInAct(SETTLE_MS + 50);
    expect(measures).toHaveBeenCalled();

    measures.mockClear();
    await pointer("pointerdown", { button: 0, clientX: 1, clientY: 1 });
    await pointer("pointermove", { clientX: 60, clientY: 1 });
    await pointer("pointerup", { button: 0, clientX: 60, clientY: 1 });
    await waitInAct(SETTLE_MS + 50);
    expect(measures).toHaveBeenCalled();
  });

  it("removes its listeners and the cursor when it unmounts", async () => {
    const { unmount } = await mount();
    const onWindow = vi.spyOn(window, "removeEventListener");
    const onCanvas = vi.spyOn(canvas, "removeEventListener");
    await unmount();
    const windowTypes = onWindow.mock.calls.map(([type]) => type);
    expect(windowTypes).toEqual(expect.arrayContaining(["keydown", "keyup", "blur"]));
    const canvasTypes = onCanvas.mock.calls.map(([type]) => type);
    expect(canvasTypes).toEqual(
      expect.arrayContaining(["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel", "contextmenu"]),
    );
    expect(canvas.style.cursor).toBe("");
  });

  describe("walking", () => {
    it("stands 1.8 m over the territory and walks along it, whatever the pitch, up to its edge", async () => {
      reducedMotion();
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, -0.5);
      camera.quaternion.setFromEuler(new Euler(-0.6, 0, 0, "YXZ")); // looking down
      await walkTo(true);
      expect(camera.position.y).toBeCloseTo(1.18);
      expect(camera.near).toBeCloseTo(0.01);
      await key("keydown", "KeyW");
      await key("keydown", "ShiftLeft");
      await frames(40); // 2 s at 0.4 u/s would carry it 0.8 — past the edge at z = -1
      expect(camera.position.y).toBeCloseTo(1.18);
      // Float steps of 0.02 may land a hair past -1 before the ray misses.
      expect(camera.position.z).toBeGreaterThan(-1.001);
      expect(camera.position.z).toBeLessThan(-0.95);
    });

    it("refuses with nothing under the camera, and keeps flying where it was", async () => {
      const refused = vi.fn();
      const { camera, walkTo } = await mount();
      camera.position.set(5, 3, 5);
      await walkTo(true, refused);
      expect(refused).toHaveBeenCalledOnce();
      expect(camera.position.y).toBe(3);
      expect(camera.near).toBeCloseTo(clipPlanes(Math.sqrt(3)).near);
    });

    it("stands on a placed object, and drops to the territory once it is gone", async () => {
      reducedMotion();
      const sceneRef = territory(); // top y = 1
      const crate = new Mesh(new BoxGeometry(0.6, 0.2, 0.6));
      crate.position.set(0, 1.1, 0); // top y = 1.2, sitting on the territory
      const solid = { current: new Group() };
      solid.current.add(sceneRef.current, crate);
      const { camera, frames, walkTo } = await mount(true, sceneRef, solid);
      camera.position.set(0, 3, 0);
      await walkTo(true);
      expect(camera.position.y).toBeCloseTo(1.2 + 0.18);
      // Hiding it unmounts it (PlacementsLayer): the walker is left over the territory and falls to it.
      solid.current.remove(crate);
      await frames(30);
      expect(camera.position.y).toBeCloseTo(1 + 0.18);
    });

    it("flies again on the spot, without coasting, with the free cam's clip", async () => {
      const { camera, key, frames, walkTo } = await mount(); // eased: no reduced motion
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "KeyW");
      await frames(2);
      await key("keyup", "KeyW");
      await walkTo(false);
      const here = camera.position.clone();
      await frames(4);
      expect(camera.position.equals(here)).toBe(true);
      expect(camera.near).toBeCloseTo(clipPlanes(Math.sqrt(3)).near);
      expect(camera.far).toBeCloseTo(clipPlanes(Math.sqrt(3)).far);
    });

    it("keeps sinking off a ledge after the keys are up, and lands", async () => {
      reducedMotion();
      // High ground x ∈ [-1, 1] (top y = 1), a low slab x ∈ [1, 3] (top y = 0.1).
      const sceneRef = territory();
      const low = new Mesh(new BoxGeometry(2, 0.2, 2));
      low.position.set(2, 0, 0);
      sceneRef.current.add(low);
      const { camera, key, frames, walkTo } = await mount(true, sceneRef);
      camera.position.set(0.9, 3, 0);
      camera.quaternion.setFromEuler(new Euler(0, -Math.PI / 2, 0, "YXZ")); // facing +X
      await walkTo(true);
      await key("keydown", "KeyW");
      await frames(20); // 1 s at 0.14 u/s: over the edge at x = 1
      await key("keyup", "KeyW");
      const offEdge = camera.position.y;
      await frames(5);
      expect(camera.position.y).toBeLessThan(offEdge);
      await frames(40);
      expect(camera.position.y).toBeCloseTo(0.1 + 0.18);
    });

    it("leaves the free cam straight from a walk with the orbit's own clip back", async () => {
      const controls = fakeControls();
      const probe: { camera?: Camera } = {};
      const sceneRef = territory();
      const r = await ReactThreeTestRenderer.create(scene(controls, probe, sceneRef, false));
      const camera = probe.camera as PerspectiveCamera;
      const orbit = { near: camera.near, far: camera.far };
      await r.update(scene(controls, probe, sceneRef, true));
      camera.position.set(0, 3, 0.5);
      await r.update(scene(controls, probe, sceneRef, true, true));
      expect(camera.near).toBeCloseTo(0.01);
      await r.update(scene(controls, probe, sceneRef, false));
      expect(camera.near).toBe(orbit.near);
      expect(camera.far).toBe(orbit.far);
      expect(controls.enabled).toBe(true);
      await r.unmount();
    });

    it("keeps the walk's clip when it mounts already walking, and the orbit's on the way out", async () => {
      const controls = fakeControls();
      const probe: { camera?: Camera } = {};
      const sceneRef = territory();
      const r = await ReactThreeTestRenderer.create(scene(controls, probe, sceneRef, false));
      const camera = probe.camera as PerspectiveCamera;
      const orbit = { near: camera.near, far: camera.far };
      camera.position.set(0, 3, 0.5);
      await r.update(scene(controls, probe, sceneRef, true, true));
      expect(camera.near).toBeCloseTo(0.01, 6);
      await r.update(scene(controls, probe, sceneRef, false));
      expect(camera.near).toBe(orbit.near);
      expect(camera.far).toBe(orbit.far);
      await r.unmount();
    });

    it("starts each way of moving at ×1: the wheel's speed does not carry over", async () => {
      reducedMotion();
      const { camera, key, frames, wheel, walkTo } = await mount();
      await wheel(-1000); // flying ×7.4
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      const start = camera.position.z;
      await key("keydown", "KeyW");
      await frames(4); // 0.2 s at 0.14 u/s
      expect(start - camera.position.z).toBeCloseTo(0.028, 3);
    });

    it("stops short of a building standing on the territory, and slides along it", async () => {
      reducedMotion();
      // A 6 m-wide, 10 m-tall block on the top (y = 1), its +Z face at z = -0.4.
      // Its floor is the territory's top: the ray down alone walked inside.
      const sceneRef = territory();
      const building = new Mesh(new BoxGeometry(0.6, 1, 0.6));
      building.position.set(0, 1.5, -0.7);
      sceneRef.current.add(building);
      const { camera, key, frames, walkTo } = await mount(true, sceneRef);
      camera.position.set(0, 3, 0);
      await walkTo(true);
      await key("keydown", "KeyW");
      await key("keydown", "ShiftLeft");
      await frames(40); // 2 s at 0.4 u/s would carry it 0.8 — through the face
      // Head-on it keeps the body's 0.03 off the face: it stops at -0.36.
      expect(camera.position.z).toBeGreaterThan(-0.4 + 0.03);
      expect(camera.position.z).toBeLessThan(-0.33);
      await key("keydown", "KeyD");
      await frames(10);
      expect(camera.position.x).toBeGreaterThan(0.05);
      expect(camera.position.z).toBeGreaterThan(-0.4);
    });

    it("moves a stalled frame's worth of a tenth of a second, no more", async () => {
      // The rig clamps dt (MAX_STEP_S): the probe reaches as far as any step,
      // but the ray down sees only where the step lands, not what it skipped.
      reducedMotion();
      const { r, camera, key, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "KeyW");
      await ReactThreeTestRenderer.act(async () => r.advanceFrames(1, 5));
      expect(0.5 - camera.position.z).toBeCloseTo(0.014, 3);
    });

    // Counts the rises off the ground: a new hop starts only from rest.
    const hopsIn = async (frames: (n: number) => Promise<void>, camera: PerspectiveCamera, n: number) => {
      let hops = 0;
      let up = camera.position.y > 1.18 + 1e-3;
      for (let i = 0; i < n; i++) {
        await frames(1);
        const rising = camera.position.y > 1.18 + 1e-3;
        if (rising && !up) hops++;
        up = rising;
      }
      return hops;
    };

    it("a held Space jumps once, then stands", async () => {
      reducedMotion();
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "Space");
      await frames(1); // the take-off: in the air from here
      expect(camera.position.y).toBeGreaterThan(1.18);
      // The key is still down: the auto-repeat keydowns must not jump again on landing.
      const repeating = async (n: number) => {
        await key("keydown", "Space", { repeat: true });
        await frames(n);
      };
      expect(await hopsIn(repeating, camera, 40)).toBe(0);
      expect(camera.position.y).toBeCloseTo(1.18);
    });

    it("a Space released before the next frame still jumps", async () => {
      reducedMotion();
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "Space");
      await key("keyup", "Space");
      await frames(1);
      expect(camera.position.y).toBeGreaterThan(1.18);
    });

    it("a Space pressed in the air is spent by the next frame, and does not jump on landing", async () => {
      reducedMotion();
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "Space");
      await frames(1); // the take-off
      await key("keyup", "Space");
      await key("keydown", "Space"); // in the air, not a jump; still down while it is spent
      await frames(1);
      expect(await hopsIn(frames, camera, 30)).toBe(0);
      await key("keyup", "Space");
      expect(camera.position.y).toBeCloseTo(1.18);
    });

    it("leaves Space to the page while not walking: no jump, nothing kept from it", async () => {
      reducedMotion();
      const { camera, frames } = await mount();
      const start = camera.position.clone();
      const e = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
      await ReactThreeTestRenderer.act(async () => {
        window.dispatchEvent(e);
      });
      await frames(4);
      expect(e.defaultPrevented).toBe(false);
      expect(camera.position.equals(start)).toBe(true);
    });

    /** Each frame's camera y over `n` frames. */
    const ys = async (frames: (n: number) => Promise<void>, camera: PerspectiveCamera, n: number) => {
      const seen: number[] = [];
      for (let i = 0; i < n; i++) {
        await frames(1);
        seen.push(camera.position.y);
      }
      return seen;
    };
    /** A 0.03-unit kerb (0.3 m) on the top, its near edge at z = -0.2. */
    const kerbed = () => {
      const sceneRef = territory();
      const kerb = new Mesh(new BoxGeometry(2, 0.03, 0.8));
      kerb.position.set(0, 1.015, -0.6);
      sceneRef.current.add(kerb);
      return sceneRef;
    };

    it("climbs a kerb with the eye catching up instead of snapping, under reduced motion too", async () => {
      reducedMotion();
      const { camera, key, frames, walkTo } = await mount(true, kerbed());
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "KeyW");
      const seen = await ys(frames, camera, 120); // well onto the kerb
      const rises = seen.slice(1).map((y, i) => y - seen[i]);
      // The body takes the whole 0.03 in one step; a critically damped eye takes ~59 % of it in the first 50 ms frame.
      expect(Math.max(...rises)).toBeLessThan(0.021);
      await key("keyup", "KeyW");
      await frames(20);
      expect(camera.position.y).toBeCloseTo(1.21, 9);
    });

    it("lands a jump with a dip that swings back a little past the eye, then settles on it exactly", async () => {
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "Space");
      const seen = await ys(frames, camera, 60);
      const landed = seen.findIndex((y, i) => i > 3 && y < 1.18);
      const after = seen.slice(landed);
      expect(Math.min(...after)).toBeLessThan(1.18 - 0.004); // ~6.6 cm at 10 m a unit
      expect(Math.min(...after)).toBeGreaterThan(1.18 - 0.01);
      expect(Math.max(...after)).toBeGreaterThan(1.18);
      await frames(20);
      expect(camera.position.y).toBeCloseTo(1.18, 9);
    });

    it("under reduced motion neither dips nor widens the view", async () => {
      reducedMotion();
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "Space");
      expect(Math.min(...(await ys(frames, camera, 40)))).toBeGreaterThanOrEqual(1.18 - 1e-9);
      const base = camera.fov; // the test renderer's camera: 75°, not the app's 50°
      await key("keydown", "KeyW");
      await key("keydown", "ShiftLeft");
      await frames(20);
      expect(camera.fov).toBe(base);
    });

    it("widens the view 3° at a run and brings it home once Shift is up", async () => {
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      const base = camera.fov;
      await key("keydown", "KeyW");
      await key("keydown", "ShiftLeft");
      await frames(20);
      expect(camera.fov).toBeCloseTo(base + 3, 1);
      await key("keyup", "ShiftLeft");
      await frames(40);
      expect(camera.fov).toBe(base);
    });

    it("leaves a walk mid-run with nothing on screen moving, the view easing home", async () => {
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      const base = camera.fov;
      await key("keydown", "KeyW");
      await key("keydown", "ShiftLeft");
      await frames(10);
      await key("keyup", "KeyW");
      await key("keyup", "ShiftLeft");
      const here = camera.position.clone();
      const wide = camera.fov;
      await walkTo(false);
      await frames(1);
      expect(camera.position.equals(here)).toBe(true);
      expect(camera.fov).toBeLessThan(wide);
      expect(camera.fov).toBeGreaterThan(base);
      await frames(40);
      expect(camera.position.equals(here)).toBe(true);
      expect(camera.fov).toBe(base);
    });

    it("leaves the free cam mid-run where it stands, and the view eases home on its own", async () => {
      const { camera, key, frames, walkTo, unmount } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      const base = camera.fov;
      await key("keydown", "KeyW");
      await key("keydown", "ShiftLeft");
      await frames(10);
      const queue: FrameRequestCallback[] = [];
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queue.push(cb));
      vi.stubGlobal("cancelAnimationFrame", () => {});
      const here = camera.position.clone();
      const wide = camera.fov;
      await unmount();
      expect(camera.position.equals(here)).toBe(true);
      expect(camera.fov).toBe(wide); // no snap on the way out
      let now = 0;
      for (let i = 0; i < 400 && queue.length > 0; i++) queue.shift()!((now += 16));
      expect(camera.fov).toBe(base);
    });

    it("looks around mid-dip without the camera jumping to the body", async () => {
      const { camera, key, frames, pointer, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "Space");
      const seen = await ys(frames, camera, 30);
      const landed = seen.findIndex((y, i) => i > 3 && y < 1.18);
      expect(landed).toBeGreaterThan(0);
      await frames(1); // mid-dip
      const y = camera.position.y;
      await pointer("pointerdown", { button: 0, clientX: 100, clientY: 100 });
      await pointer("pointermove", { clientX: 140, clientY: 100 });
      expect(camera.position.y).toBe(y);
    });

    it("a key pressed mid-dip changes nothing on screen", async () => {
      // The press re-reads the pose (resync): the eye's offset is not a camera moved from outside.
      const landing = async (press: boolean) => {
        const { camera, key, frames, walkTo, unmount } = await mount();
        camera.position.set(0, 3, 0.5);
        await walkTo(true);
        await key("keydown", "Space");
        const first = await ys(frames, camera, 14);
        if (press) await key("keydown", "KeyQ"); // a move key walking ignores
        const rest = await ys(frames, camera, 20);
        await unmount();
        return [...first, ...rest];
      };
      const plain = await landing(false);
      const pressed = await landing(true);
      pressed.forEach((y, i) => expect(y).toBeCloseTo(plain[i], 12));
    });

    it("re-placed mid-dip, the camera stays where it is shown and settles without a jump", async () => {
      // A walk re-placed while it goes on (a new onWalkRefused identity re-runs useWalk) must bake the
      // eye's offset into the body first: otherwise the offset is counted twice, once in the body, once in the eye.
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await key("keydown", "Space");
      // Frame by frame until the landing has sagged the eye: the walk is re-placed mid-dip.
      for (let i = 0; i < 60 && camera.position.y > 1.18 - 0.003; i++) await frames(1);
      const before = camera.position.y;
      expect(before).toBeLessThan(1.18 - 0.003);
      await walkTo(true, () => {});
      expect(camera.position.y).toBeCloseTo(before, 9);
      const after = await ys(frames, camera, 20);
      const shown = [before, ...after];
      // The eye springs home from the dip it was shown at: a catch-up, not a jump. Counting the dip twice would
      // send the first frame down by the dip again, so it must rise instead.
      expect(after[0]).toBeGreaterThan(before);
      expect(Math.max(...shown.slice(1).map((y, i) => Math.abs(y - shown[i])))).toBeLessThan(0.006);
      expect(Math.min(...after)).toBeGreaterThan(1.18 - 0.01);
      await frames(20);
      expect(camera.position.y).toBeCloseTo(1.18, 9);
    });

    it("stands exactly on the body once settled, and does not drift over a long walk with presses", async () => {
      const { camera, key, frames, walkTo } = await mount();
      camera.position.set(0, 3, 0.5);
      await walkTo(true);
      await frames(40);
      expect(camera.position.y).toBeCloseTo(1.18, 9); // at rest the camera is the body, no offset left
      await key("keydown", "KeyW");
      for (let i = 0; i < 20; i++) {
        await frames(3);
        await key("keydown", "KeyQ"); // each press re-reads the camera (resync): the bob must not be taken as drift
      }
      const bobbing = await ys(frames, camera, 40);
      // The bob only ever goes down, 1.5 cm at a walk: never above the eye, never a metre off it.
      for (const y of bobbing) {
        expect(y).toBeLessThanOrEqual(1.18 + 1e-9);
        expect(y).toBeGreaterThan(1.18 - 0.0016);
      }
    });
  });
});
