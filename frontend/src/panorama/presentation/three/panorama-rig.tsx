import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Panorama } from "@/panorama/domain/panorama";

// enterPanorama mutates the shared controls + camera to lock the view
// at the panorama anchor and returns a cleanup that restores the prior
// state. Lives outside the component so the hooks linter doesn't see
// the writes as modifying hook outputs.
function enterPanorama(
  controls: OrbitControlsImpl,
  camera: Camera,
  panorama: Panorama,
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

  camera.position.set(
    panorama.position.x,
    panorama.position.y,
    panorama.position.z,
  );
  controls.target.set(
    panorama.position.x,
    panorama.position.y,
    panorama.position.z + 0.01,
  );
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

interface PanoramaRigProps {
  panorama: Panorama;
}

// PanoramaRig hijacks the shared OrbitControls instance while a panorama
// is active: camera teleports to the panorama anchor, target is offset
// so the initial look direction is "forward" along +Z (the user can
// always orbit afterwards), and zoom/pan are disabled so the controls
// behave like a head-only camera. State is restored on unmount.
export default function PanoramaRig({ panorama }: PanoramaRigProps) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree(
    (s) => s.controls as OrbitControlsImpl | null,
  );

  useEffect(() => {
    if (!controls) return;
    return enterPanorama(controls, camera, panorama, invalidate);
  }, [camera, controls, invalidate, panorama]);

  return null;
}
