import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";

// enterPanorama locks the shared controls + camera at the anchor and
// returns a cleanup that restores the prior state. Lives outside the
// component so the hooks linter doesn't see the writes as modifying hook
// outputs.
function enterPanorama(
  controls: OrbitControlsImpl,
  camera: Camera,
  anchor: Vec3,
  invalidate: () => void,
): () => void {
  const prev = {
    enableZoom: controls.enableZoom,
    enablePan: controls.enablePan,
    target: controls.target.clone(),
    cameraPos: camera.position.clone(),
    minDist: controls.minDistance,
    maxDist: controls.maxDistance,
  };
  camera.position.set(anchor.x, anchor.y, anchor.z);
  controls.target.set(anchor.x, anchor.y, anchor.z + 0.01);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minDistance = 0.005;
  controls.maxDistance = 0.02;
  controls.update();
  invalidate();
  return () => {
    camera.position.copy(prev.cameraPos);
    controls.target.copy(prev.target);
    controls.enableZoom = prev.enableZoom;
    controls.enablePan = prev.enablePan;
    controls.minDistance = prev.minDist;
    controls.maxDistance = prev.maxDist;
    controls.update();
    invalidate();
  };
}

// followAnchor translates the camera + orbit target by a delta, preserving
// the look direction. Outside the component (like enterPanorama) so the
// hooks linter doesn't flag the writes to camera/controls.
function followAnchor(
  controls: OrbitControlsImpl,
  camera: Camera,
  delta: Vec3,
  invalidate: () => void,
): void {
  camera.position.x += delta.x;
  camera.position.y += delta.y;
  camera.position.z += delta.z;
  controls.target.x += delta.x;
  controls.target.y += delta.y;
  controls.target.z += delta.z;
  controls.update();
  invalidate();
}

interface PanoramaRigProps {
  panorama: Panorama;
}

// PanoramaRig hijacks the shared OrbitControls while a panorama is active.
// Entering teleports the camera to the anchor and disables zoom/pan
// (head-only camera). During overlay calibration the anchor position can
// change live; we then translate camera + target by the delta so the view
// follows the anchor WITHOUT resetting the look direction. Yaw never moves
// the camera (the sphere rotates instead). State restores on unmount.
export default function PanoramaRig({ panorama }: PanoramaRigProps) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls as OrbitControlsImpl | null);
  const id = panorama.id;
  const { x: px, y: py, z: pz } = panorama.position;

  // Active panorama id + last anchor + the restore cleanup, carried across
  // re-runs. Touched only inside effects (never during render). A single
  // effect distinguishes "new panorama" (enter, reset look) from "anchor
  // nudged" (follow, keep look) so a live position change doesn't reset the
  // view — and it returns no cleanup, so a nudge never tears the rig down.
  const ref = useRef<{
    id: number | null;
    pos: Vec3;
    cleanup: (() => void) | null;
  }>({ id: null, pos: { x: px, y: py, z: pz }, cleanup: null });

  useEffect(() => {
    if (!controls) return;
    const st = ref.current;
    if (st.id !== id || !st.cleanup) {
      st.cleanup?.();
      st.cleanup = enterPanorama(controls, camera, { x: px, y: py, z: pz }, invalidate);
      st.id = id;
      st.pos = { x: px, y: py, z: pz };
      return;
    }
    const dx = px - st.pos.x;
    const dy = py - st.pos.y;
    const dz = pz - st.pos.z;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      followAnchor(controls, camera, { x: dx, y: dy, z: dz }, invalidate);
      st.pos = { x: px, y: py, z: pz };
    }
  }, [camera, controls, invalidate, id, px, py, pz]);

  useEffect(() => {
    const st = ref.current;
    return () => {
      st.cleanup?.();
      st.cleanup = null;
      st.id = null;
    };
  }, []);

  return null;
}
