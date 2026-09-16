import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { stopCoast } from "./stop-coast";

interface CameraRigProps {
  resetVersion: number;
}

// CameraRig owns OrbitControls explicitly (not via drei's <OrbitControls>)
// so it can drive the render loop directly. With Canvas in
// frameloop="demand", every render needs an explicit invalidate() call.
//
// Render policy: invalidate on every controls "change" — drag and wheel
// alike. Per-frame work is just a GPU draw of cached buffers under a new
// view matrix. No throttling, no idle gating.
//
// Damping lets a released orbit coast to a stop rather than halting where the
// pointer let go. Under frameloop="demand" nothing drives the coast, so a
// change also asks for one frame that calls update(): update() fires "change"
// again while the view still moves, which asks for the next one, and stops by
// itself once the motion settles below three's epsilon. Off under reduced
// motion: the camera then stops exactly where the gesture did.
const DAMPING = 0.08;

export default function CameraRig({ resetVersion }: CameraRigProps) {
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const set = useThree((state) => state.set);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const controls = new OrbitControlsImpl(camera, gl.domElement);
    controls.dampingFactor = DAMPING;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 0.01;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    // makeDefault-equivalent: PlacementsLayer reads controls via
    // useThree(s => s.controls) to disable rotation during a gizmo drag.
    set({ controls });

    let frame = 0;
    const coast = () => {
      frame = 0;
      controls.update();
    };
    const onChange = () => {
      invalidate();
      if (controls.enableDamping && !frame) frame = requestAnimationFrame(coast);
    };

    controls.addEventListener("change", onChange);

    return () => {
      cancelAnimationFrame(frame);
      controls.removeEventListener("change", onChange);
      controls.dispose();
      set({ controls: null });
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate, set]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enableDamping = !still;
  }, [still]);

  // Explicit reset path — separate from the wheel/change stream so it
  // always paints the new framing immediately.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    stopCoast(controls);
    controls.reset();
    controls.update();
    invalidate();
  }, [resetVersion, invalidate]);

  return null;
}
