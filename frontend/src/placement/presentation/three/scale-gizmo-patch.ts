import type { Group, Object3D } from "three";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";

// three-stdlib's TransformControls keeps its handle groups under
// `gizmo` (a TransformControlsGizmo whose own `gizmo` and `picker`
// dictionaries hold the per-mode groups). Scale mode in this fork has
// no single central XYZ cube — it ships three uniform-scale cubes
// named `XYZX` / `XYZY` / `XYZZ` at the tips of each axis. We keep
// just one (`XYZX`) so the user sees a single grabbable handle.
interface ScaleGizmo {
  gizmo: {
    gizmo: { scale: Group };
    picker: { scale: Group };
    updateMatrixWorld: (force?: boolean) => void;
  };
}

function scaleHandles(tc: TransformControlsImpl): Object3D[] {
  const g = tc as unknown as ScaleGizmo;
  return [...g.gizmo.gizmo.scale.children, ...g.gizmo.picker.scale.children];
}

// patchScaleGizmo monkey-patches the gizmo so only the central uniform
// XYZ cube is visible / pickable in scale mode. TransformControlsGizmo
// resets handle.visible every frame inside updateMatrixWorld, so a
// one-shot set doesn't stick — we wrap that method and re-apply the
// hide rule after the original runs. Returns a teardown that restores
// the original implementation.
export function patchScaleGizmo(tc: TransformControlsImpl): () => void {
  const gizmo = (tc as unknown as ScaleGizmo).gizmo;
  const original = gizmo.updateMatrixWorld;
  gizmo.updateMatrixWorld = function patched(force) {
    original.call(this, force);
    if (tc.getMode() !== "scale") return;
    for (const h of scaleHandles(tc)) {
      if (h.name !== "XYZX") h.visible = false;
    }
  };
  return () => {
    gizmo.updateMatrixWorld = original;
  };
}
