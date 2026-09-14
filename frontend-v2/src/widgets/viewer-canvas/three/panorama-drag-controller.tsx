import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, type Object3D } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Vec3 } from "@/entities/placement";

interface PanoramaDragControllerProps {
  dragging: boolean;
  /** The territory's outer group — the only surface a marker may land on. */
  territoryRef: RefObject<Object3D | null>;
  onMove: (point: Vec3) => void;
  onEnd: () => void;
}

// Module-level scratch: a drag fires a pointermove per frame and neither of
// these is worth allocating that often. Single-writer — the handler below runs
// on the main thread and never interleaves with itself.
const raycaster = new Raycaster();
const pointer = new Vector2();

// Lives outside the component so the hooks linter doesn't read the write as a
// modification of a hook's return value — the shape panorama-rig uses for the
// same reason. OrbitControls is a three.js object, not React state.
const setOrbit = (controls: OrbitControlsImpl | null, enabled: boolean) => {
  if (controls) controls.enabled = enabled;
};

// PanoramaDragController owns a marker drag from grab to release. It lives
// INSIDE the Canvas because it needs useThree to reach the camera and the
// controls CameraRig published via set({controls}). Renders nothing.
//
// Three things have to happen while a marker is held:
//   - OrbitControls must not rotate the camera, or the scene spins under the
//     marker being placed. Imperative toggle of a three.js object, the same
//     technique use-gizmo-events uses.
//   - The cursor has to be projected onto the territory surface. Constraining
//     it to the territory is deliberate: the first hit of *any* object let a
//     marker leap onto a placement under the cursor, and while the GLB is
//     still loading the only hits are placements — which is what sent markers
//     flying to unreachable spots. No territory hit (not loaded, or the ray is
//     off the mesh) leaves the marker where it was; Y stays editable by hand.
//   - The drag must end even when the pointer is released off the mesh, hence
//     window rather than a mesh handler.
export default function PanoramaDragController({
  dragging,
  territoryRef,
  onMove,
  onEnd,
}: PanoramaDragControllerProps) {
  const controls = useThree((s) => s.controls as OrbitControlsImpl | null);
  const camera = useThree((s) => s.camera);
  // R3F's own canvas rect, kept current by its resize observer. Read from the
  // store rather than getBoundingClientRect() so the projection uses the same
  // numbers R3F's event system does.
  const size = useThree((s) => s.size);

  useEffect(() => {
    if (!dragging) return;
    setOrbit(controls, false);

    const move = (event: PointerEvent | MouseEvent) => {
      const surface = territoryRef.current;
      if (!surface) return;
      pointer.set(
        ((event.clientX - size.left) / size.width) * 2 - 1,
        -((event.clientY - size.top) / size.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      // The territory's world matrices are only refreshed on a rendered frame,
      // and frameloop="demand" means there may not have been one since the
      // camera last moved.
      surface.updateMatrixWorld(true);
      const hit = raycaster.intersectObject(surface, true)[0];
      if (!hit) return;
      onMove({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
    };
    const up = () => onEnd();

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setOrbit(controls, true);
    };
  }, [dragging, controls, camera, size, territoryRef, onMove, onEnd]);

  return null;
}
