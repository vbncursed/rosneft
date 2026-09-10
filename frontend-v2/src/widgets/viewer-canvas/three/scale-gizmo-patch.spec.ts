import { Group, Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { patchScaleGizmo } from "./scale-gizmo-patch";

const handle = (name: string) => {
  const o = new Object3D();
  o.name = name;
  o.visible = true;
  return o;
};

function fakeControls(mode: string) {
  const gizmoScale = new Group();
  gizmoScale.add(handle("XYZX"), handle("XYZY"), handle("XYZZ"));
  const pickerScale = new Group();
  pickerScale.add(handle("XYZX"), handle("XYZY"));
  const original = vi.fn();
  const tc = {
    getMode: () => mode,
    gizmo: {
      gizmo: { scale: gizmoScale },
      picker: { scale: pickerScale },
      updateMatrixWorld: original,
    },
  };
  return { tc: tc as unknown as TransformControlsImpl, gizmoScale, pickerScale, original };
}

const visible = (g: Group) => g.children.filter((c) => c.visible).map((c) => c.name);

describe("patchScaleGizmo", () => {
  it("leaves one grabbable uniform-scale handle in scale mode", () => {
    const { tc, gizmoScale, pickerScale } = fakeControls("scale");
    patchScaleGizmo(tc);
    (tc as unknown as { gizmo: { updateMatrixWorld: () => void } }).gizmo.updateMatrixWorld();
    expect(visible(gizmoScale)).toEqual(["XYZX"]);
    expect(visible(pickerScale)).toEqual(["XYZX"]);
  });

  it("runs the original implementation first, every frame", () => {
    // TransformControlsGizmo resets handle.visible inside updateMatrixWorld,
    // so the hide rule has to be re-applied after it, not once at attach.
    const { tc, original, gizmoScale } = fakeControls("scale");
    patchScaleGizmo(tc);
    const gizmo = (tc as unknown as { gizmo: { updateMatrixWorld: (f?: boolean) => void } }).gizmo;
    gizmo.updateMatrixWorld(true);
    gizmoScale.children[1].visible = true;
    gizmo.updateMatrixWorld(true);
    expect(original).toHaveBeenCalledTimes(2);
    expect(visible(gizmoScale)).toEqual(["XYZX"]);
  });

  it("touches nothing in translate or rotate mode", () => {
    const { tc, gizmoScale } = fakeControls("translate");
    patchScaleGizmo(tc);
    (tc as unknown as { gizmo: { updateMatrixWorld: () => void } }).gizmo.updateMatrixWorld();
    expect(visible(gizmoScale)).toEqual(["XYZX", "XYZY", "XYZZ"]);
  });

  it("restores the original implementation on teardown", () => {
    const { tc, original } = fakeControls("scale");
    const gizmo = (tc as unknown as { gizmo: { updateMatrixWorld: unknown } }).gizmo;
    patchScaleGizmo(tc)();
    expect(gizmo.updateMatrixWorld).toBe(original);
  });
});
