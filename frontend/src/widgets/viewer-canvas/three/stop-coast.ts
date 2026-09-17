import type { Object3D, Vector3 } from "three";

type Coasting = { enableDamping: boolean; update: () => unknown };

/**
 * Spends whatever inertia the orbit still carries, in one step. With damping
 * off, OrbitControls.update() applies the leftover delta whole and zeroes it;
 * with it on, the coast would keep turning the view under a reset or a grab —
 * `update()` ignores `enabled`, and `reset()` does not clear the delta.
 */
export function stopCoast(controls: Coasting): void {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
}

/**
 * For a grab (gizmo, marker): the leftover inertia is dropped where the view
 * stands. `stopCoast` alone applies it in one frame, so a grab right after a
 * flick jumped the camera; here the camera and the orbit target are put back
 * as they were. A reset needs none of this — `reset()` places the camera.
 */
export function holdStill(controls: Coasting & { target: Vector3 }, camera: Object3D): void {
  const position = camera.position.clone();
  const quaternion = camera.quaternion.clone();
  const target = controls.target.clone();
  stopCoast(controls);
  camera.position.copy(position);
  camera.quaternion.copy(quaternion);
  controls.target.copy(target);
}
