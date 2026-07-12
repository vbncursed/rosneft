import { type RefObject, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Vec3 } from "@/shared/domain/vec3";
import { dirToYaw } from "@/panorama/domain/look-yaw";

interface CameraPositionTrackerProps {
  positionRef: RefObject<Vec3 | null>;
  // Live horizontal camera yaw (radians), read by the panorama edit panel to
  // capture a default view. Written on the same OrbitControls "change" events.
  yawRef: RefObject<number | null>;
}

// Reused across sync calls so the "change" listener doesn't allocate a Vector3
// per event.
const dir = new Vector3();

// CameraPositionTracker mirrors the live camera position and horizontal yaw
// into imperative refs so components outside the Canvas (the panorama edit
// panel) can read them on demand. Lives inside the Canvas tree for useThree.
export default function CameraPositionTracker({
  positionRef,
  yawRef,
}: CameraPositionTrackerProps) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls as { addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void } | null);

  useEffect(() => {
    const sync = () => {
      positionRef.current = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      };
      camera.getWorldDirection(dir);
      yawRef.current = dirToYaw(dir.x, dir.z);
    };
    sync();
    controls?.addEventListener?.("change", sync);
    return () => controls?.removeEventListener?.("change", sync);
  }, [camera, controls, positionRef, yawRef]);

  return null;
}
