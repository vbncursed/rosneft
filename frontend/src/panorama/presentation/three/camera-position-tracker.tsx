import { type RefObject, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { Vec3 } from "@/shared/domain/vec3";

interface CameraPositionTrackerProps {
  positionRef: RefObject<Vec3 | null>;
}

// CameraPositionTracker mirrors the live camera position into an
// imperative ref so components outside the Canvas (the panorama edit
// panel) can read it on demand. Updates on every render but the work
// is one Vec3 allocation — cheap. Lives inside the Canvas tree so it
// has access to useThree.
export default function CameraPositionTracker({
  positionRef,
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
    };
    sync();
    controls?.addEventListener?.("change", sync);
    return () => controls?.removeEventListener?.("change", sync);
  }, [camera, controls, positionRef]);

  return null;
}
