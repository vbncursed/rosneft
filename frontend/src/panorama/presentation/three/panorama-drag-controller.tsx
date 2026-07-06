import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface PanoramaDragControllerProps {
  dragging: boolean;
  onEnd: () => void;
}

// While a marker is grabbed, OrbitControls must not rotate the camera, and
// the drag must end even if the pointer is released off the mesh — so we
// listen on window for pointerup. Lives INSIDE the Canvas because it needs
// useThree to reach the controls CameraRig registered via set({controls}).
// Renders nothing.
export default function PanoramaDragController({
  dragging,
  onEnd,
}: PanoramaDragControllerProps) {
  const controls = useThree(
    (s) => s.controls as OrbitControlsImpl | null,
  );

  useEffect(() => {
    if (!dragging) return;
    // Imperative toggle of CameraRig's OrbitControls (a three.js object, not
    // React state) — same technique as use-gizmo-events, which mutates it
    // inside an event callback that the immutability rule doesn't flag.
    // eslint-disable-next-line react-hooks/immutability
    if (controls) controls.enabled = false;
    const up = () => onEnd();
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointerup", up);
      if (controls) controls.enabled = true;
    };
  }, [dragging, controls, onEnd]);

  return null;
}
