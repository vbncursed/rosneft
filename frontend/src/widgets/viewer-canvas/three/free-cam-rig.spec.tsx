import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useEffect, type ReactNode } from "react";
import { BoxGeometry, Group, Mesh, Vector3, type Camera, type PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const scene = (
  controls: ReturnType<typeof fakeControls>,
  probe: { camera?: Camera },
  sceneRef: { current: Group },
  rig: boolean,
): ReactNode => (
  <WithControls controls={controls} probe={probe}>
    {rig ? <FreeCamRig sceneRef={sceneRef} /> : null}
    <CanvasProbe />
    <BusProbe />
  </WithControls>
);

// Every renderer a test leaves up is unmounted after it: a live rig keeps its
// window listeners, and they would fly the camera in the next test.
const live = new Set<() => Promise<void>>();

async function mount(rig = true) {
  const controls = fakeControls();
  const probe: { camera?: Camera } = {};
  const sceneRef = territory();
  const r = await ReactThreeTestRenderer.create(scene(controls, probe, sceneRef, rig));
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
  return { r, controls, camera, sceneRef, probe, frames, key, pointer, wheel, unmount: stop };
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
});
