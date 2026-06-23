import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";

// Distance from the eye to the orbit target. The look direction is encoded
// as target = anchor + dir * LOOK_RADIUS; the value is otherwise arbitrary
// because recenter() pins the eye back onto the anchor every frame.
const LOOK_RADIUS = 0.01;

// recenter snaps the camera back onto the anchor after OrbitControls has
// rotated it, preserving the look direction. OrbitControls orbits the camera
// AROUND its target, so left alone the optical centre drifts on a tiny arc:
// a placement near the anchor then stays glued to screen-centre ("follows the
// camera") and distant ones swim against the panorama. Snapping the eye back
// to the anchor turns that orbit into a pure in-place head rotation — zero
// translation, zero parallax — so every placement stays locked to its real
// spot in the equirect. Lives outside the component so the hooks linter
// doesn't see the writes as modifying hook outputs.
function recenter(controls: OrbitControlsImpl, camera: Camera, anchor: Vec3): void {
  const dx = controls.target.x - camera.position.x;
  const dy = controls.target.y - camera.position.y;
  const dz = controls.target.z - camera.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  camera.position.set(anchor.x, anchor.y, anchor.z);
  controls.target.set(
    anchor.x + (dx / len) * LOOK_RADIUS,
    anchor.y + (dy / len) * LOOK_RADIUS,
    anchor.z + (dz / len) * LOOK_RADIUS,
  );
  camera.lookAt(controls.target.x, controls.target.y, controls.target.z);
}

// enterPanorama locks the shared controls + camera at the anchor, disables
// zoom/pan (head-only camera) and registers the recenter listener so every
// rotation stays in place. Returns a cleanup that unhooks the listener and
// restores the prior state. Lives outside the component (like recenter) so
// the hooks linter doesn't flag the writes to camera/controls.
function enterPanorama(
  controls: OrbitControlsImpl,
  camera: Camera,
  getAnchor: () => Vec3,
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
  const a = getAnchor();
  camera.position.set(a.x, a.y, a.z);
  controls.target.set(a.x, a.y, a.z + LOOK_RADIUS);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minDistance = LOOK_RADIUS / 2;
  controls.maxDistance = LOOK_RADIUS * 2;
  const onChange = () => recenter(controls, camera, getAnchor());
  controls.addEventListener("change", onChange);
  controls.update();
  invalidate();
  return () => {
    controls.removeEventListener("change", onChange);
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

interface PanoramaRigProps {
  panorama: Panorama;
}

// PanoramaRig hijacks the shared OrbitControls while a panorama is active.
// Entering teleports the camera to the anchor and makes it rotate strictly in
// place (see recenter). During overlay calibration the anchor position can
// change live; we then re-pin the camera onto the new anchor WITHOUT resetting
// the look direction. Yaw never moves the camera (the sphere rotates instead).
// State restores on unmount.
export default function PanoramaRig({ panorama }: PanoramaRigProps) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls as OrbitControlsImpl | null);
  const id = panorama.id;
  const { x: px, y: py, z: pz } = panorama.position;

  // Active panorama id + last anchor + the restore cleanup, carried across
  // re-runs. Touched only inside effects (never during render). A single
  // effect distinguishes "new panorama" (enter) from "anchor nudged"
  // (re-pin, keep look) so a live position change doesn't reset the view —
  // and it returns no cleanup, so a nudge never tears the rig down.
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
      st.pos = { x: px, y: py, z: pz };
      st.id = id;
      st.cleanup = enterPanorama(controls, camera, () => ref.current.pos, invalidate);
      return;
    }
    if (px !== st.pos.x || py !== st.pos.y || pz !== st.pos.z) {
      st.pos = { x: px, y: py, z: pz };
      recenter(controls, camera, st.pos);
      invalidate();
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
