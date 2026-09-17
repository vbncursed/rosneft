import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useLayoutEffect, type RefObject } from "react";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Vector3, type Camera } from "three";
import type {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from "three-stdlib";
import { describe, expect, it, vi } from "vitest";
import type { GizmoMode } from "@/features/viewer-mode";
import { useGizmoEvents } from "./use-gizmo-events";

type Listener = (event: { value: boolean }) => void;

/** Stands in for three-stdlib's TransformControls: an event source and nothing more. */
class FakeControls {
  listeners: Record<string, Listener[]> = {};
  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
  }
  emit(type: string, event?: { value: boolean }) {
    for (const l of [...(this.listeners[type] ?? [])]) l(event as { value: boolean });
  }
}

// A 10×1×10 slab: its top face is at y = 0.5.
const SURFACE_Y = 0.5;
const territory = () => new Mesh(new BoxGeometry(10, 1, 10), new MeshBasicMaterial());

type Case = {
  tc: FakeControls;
  target: Object3D | null;
  selectedId?: number | null;
  mode?: GizmoMode;
  snapEnabled?: boolean;
  onCommit?: (id: number, t: unknown) => void;
  orbit: FakeOrbit;
  probe?: { camera?: Camera };
};

type FakeOrbit = {
  enabled: boolean;
  enableDamping?: boolean;
  target?: Vector3;
  update?: () => void;
};

function Harness({ tc, target, selectedId = 5, mode = "translate", snapEnabled = false, onCommit = vi.fn(), orbit, probe }: Case) {
  const set = useThree((s) => s.set);
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    // The probe is the spec's own object, handed in to be filled.
    // oxlint-disable-next-line react/immutability
    if (probe) probe.camera = camera;
    set({ controls: orbit as unknown as OrbitControlsImpl });
  }, [set, orbit, probe, camera]);
  useGizmoEvents({
    tcRef: { current: tc as unknown as TransformControlsImpl },
    target,
    selectedId,
    mode,
    territoryRef: { current: territory() } as RefObject<Object3D | null>,
    snapEnabled,
    onCommit,
  });
  return null;
}

const mount = (props: Omit<Case, "orbit"> & { orbit?: FakeOrbit }) => {
  const orbit = props.orbit ?? { enabled: true, enableDamping: true, target: new Vector3(), update: vi.fn() };
  return ReactThreeTestRenderer.create(<Harness {...props} orbit={orbit} />).then((r) => ({
    r,
    orbit,
  }));
};

const at = (x: number, y: number, z: number) => {
  const o = new Object3D();
  o.position.set(x, y, z);
  return o;
};

describe("useGizmoEvents", () => {
  it("suspends the orbit for the length of a drag", async () => {
    const tc = new FakeControls();
    const { orbit } = await mount({ tc, target: at(0, 5, 0) });
    tc.emit("dragging-changed", { value: true });
    expect(orbit.enabled).toBe(false);
    tc.emit("dragging-changed", { value: false });
    expect(orbit.enabled).toBe(true);
  });

  // A coast started before the grab would keep turning the view under it.
  it("stops the orbit's leftover inertia where the view stands when a drag starts", async () => {
    const tc = new FakeControls();
    const target = new Vector3(1, 1, 1);
    const probe: { camera?: Camera } = {};
    // The undamped update throws the whole leftover at the camera in one go.
    const update = vi.fn(() => {
      probe.camera!.position.x += 5;
      target.x += 5;
    });
    const { orbit } = await mount({ tc, target: at(0, 5, 0), probe, orbit: { enabled: true, enableDamping: true, target, update } });
    const before = probe.camera!.position.toArray();
    tc.emit("dragging-changed", { value: true });
    expect(orbit.update).toHaveBeenCalledOnce();
    expect(probe.camera!.position.toArray()).toEqual(before);
    expect(target.toArray()).toEqual([1, 1, 1]);
    tc.emit("dragging-changed", { value: false });
    expect(orbit.update).toHaveBeenCalledOnce();
  });

  it("commits the object's own transform once, at the end of the drag", async () => {
    const tc = new FakeControls();
    const target = at(1, 5, 2);
    target.rotation.set(0, 0.5, 0);
    target.scale.set(3, 3, 3);
    const onCommit = vi.fn();
    await mount({ tc, target, onCommit });

    tc.emit("dragging-changed", { value: true });
    expect(onCommit).not.toHaveBeenCalled();
    tc.emit("dragging-changed", { value: false });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(5, {
      position: { x: 1, y: 5, z: 2 },
      rotation: { x: 0, y: 0.5, z: 0 },
      scale: { x: 3, y: 3, z: 3 },
    });
  });

  it("commits the surface-clamped position, not the one the last tick left", async () => {
    const tc = new FakeControls();
    const onCommit = vi.fn();
    await mount({ tc, target: at(0, -4, 0), onCommit, snapEnabled: true });
    tc.emit("dragging-changed", { value: false });
    expect(onCommit.mock.calls[0][1]).toMatchObject({ position: { x: 0, y: SURFACE_Y, z: 0 } });
  });

  it("commits nothing with no selection behind the gizmo", async () => {
    const tc = new FakeControls();
    const onCommit = vi.fn();
    await mount({ tc, target: at(0, 1, 0), selectedId: null, onCommit });
    tc.emit("dragging-changed", { value: false });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("pulls the object onto the surface on every translate tick", async () => {
    const tc = new FakeControls();
    const target = at(0, 5, 0);
    await mount({ tc, target, snapEnabled: true });
    tc.emit("objectChange");
    expect(target.position.y).toBe(SURFACE_Y);
  });

  it("leaves the object alone on a translate tick outside the territory", async () => {
    const tc = new FakeControls();
    const target = at(500, 5, 500);
    await mount({ tc, target, snapEnabled: true });
    tc.emit("objectChange");
    expect(target.position.y).toBe(5);
  });

  it("makes a scale drag uniform, whichever axis the user grabbed", async () => {
    const tc = new FakeControls();
    const target = at(0, 0, 0);
    await mount({ tc, target, mode: "scale" });
    tc.emit("dragging-changed", { value: true });

    target.scale.set(1, 4, 1);
    tc.emit("objectChange");
    expect(target.scale.toArray()).toEqual([4, 4, 4]);

    target.scale.set(4, 4, 9);
    tc.emit("objectChange");
    expect(target.scale.toArray()).toEqual([9, 9, 9]);

    target.scale.set(2, 9, 9);
    tc.emit("objectChange");
    expect(target.scale.toArray()).toEqual([2, 2, 2]);
  });

  it("clamps a scale drag past the gizmo origin to a positive floor", async () => {
    // three-stdlib's scale math flips sign there; a negative scale inverts the
    // mesh and the backend refuses it.
    const tc = new FakeControls();
    const target = at(0, 0, 0);
    await mount({ tc, target, mode: "scale" });
    target.scale.set(-3, 1, 1);
    tc.emit("objectChange");
    expect(target.scale.toArray()).toEqual([0.01, 0.01, 0.01]);
  });

  it("ignores a rotate tick — no snap, no scale clamp", async () => {
    const tc = new FakeControls();
    const target = at(0, 5, 0);
    await mount({ tc, target, mode: "rotate", snapEnabled: true });
    target.scale.set(1, 4, 1);
    tc.emit("objectChange");
    expect(target.position.y).toBe(5);
    expect(target.scale.toArray()).toEqual([1, 4, 1]);
  });

  it("does nothing at all with no object under the gizmo", async () => {
    const tc = new FakeControls();
    const onCommit = vi.fn();
    await mount({ tc, target: null, onCommit, mode: "scale" });
    tc.emit("dragging-changed", { value: true });
    tc.emit("objectChange");
    tc.emit("dragging-changed", { value: false });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("lets go of the gizmo's events when it unmounts", async () => {
    const tc = new FakeControls();
    const onCommit = vi.fn();
    const { r } = await mount({ tc, target: at(0, 1, 0), onCommit });
    await r.unmount();
    tc.emit("dragging-changed", { value: false });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
