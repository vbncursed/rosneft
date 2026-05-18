import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface CameraRigProps {
  resetVersion: number;
}

// CameraRig owns OrbitControls explicitly (not via drei's <OrbitControls>)
// so it can drive the render loop directly. With Canvas in
// frameloop="demand", every render needs an explicit invalidate() call.
//
// Render policy: invalidate on every controls "change" — drag and wheel
// alike. The viewer loads a single LOD0 GLB and never swaps LODs, so per-
// frame work is just a GPU draw of cached buffers under a new view
// matrix. No throttling, no idle gating.
export default function CameraRig({ resetVersion }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const set = useThree((state) => state.set);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const controls = new OrbitControlsImpl(camera, gl.domElement);
    controls.enableDamping = false;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 0.01;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    // makeDefault-equivalent: PlacementsLayer reads controls via
    // useThree(s => s.controls) to disable rotation during a gizmo drag.
    set({ controls });

    const onChange = () => invalidate();

    controls.addEventListener("change", onChange);

    return () => {
      controls.removeEventListener("change", onChange);
      controls.dispose();
      set({ controls: null });
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate, set]);

  // Explicit reset path — separate from the wheel/change stream so it
  // always paints the new framing immediately.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.reset();
    controls.update();
    invalidate();
  }, [resetVersion, invalidate]);

  return null;
}
