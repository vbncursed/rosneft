import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface CameraRigProps {
  resetVersion: number;
}

// Final clean render fires this long after the wheel event stream goes
// quiet. Tuned for trackpad pinch / two-finger zoom, where gestures emit
// wheel events in pulses with brief pauses between phases — a shorter
// window would mistake a mid-gesture pause for the end of the gesture.
const WHEEL_IDLE_MS = 200;

// CameraRig owns OrbitControls explicitly (not via drei's <OrbitControls>)
// so it can drive the render loop directly. With Canvas in
// frameloop="demand", every render needs an explicit invalidate() call.
//
// Render policy:
//  - rotate / pan (mouse drag): invalidate on every "change" — the
//    camera must move under the cursor in real time.
//  - wheel zoom: throttle to one render per browser frame via
//    requestAnimationFrame, and call performance.regress() so AdaptiveDpr
//    drops the pixel ratio. The scene stays smooth-but-cheap during the
//    gesture instead of painting full-DPR frames per wheel event (which
//    pegged the GPU on KTX2 meshes) or freezing entirely (which read as
//    a slideshow when the user resumed after a micro-pause).
//  - WHEEL_IDLE_MS after the last wheel event: one final invalidate so
//    AdaptiveDpr gets a chance to ramp the pixel ratio back up.
//  - explicit reset / drag end: invalidate immediately.
export default function CameraRig({ resetVersion }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const set = useThree((state) => state.set);
  const performance = useThree((state) => state.performance);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const controls = new OrbitControlsImpl(camera, gl.domElement);
    controls.enableDamping = false;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 0.4;
    controls.maxDistance = 30;
    controlsRef.current = controls;

    // makeDefault-equivalent: PlacementsLayer reads controls via
    // useThree(s => s.controls) to disable rotation during a gizmo drag.
    set({ controls });

    let wheeling = false;
    let rafId: number | null = null;
    let idleTimer: number | null = null;
    const dom = gl.domElement;

    const onWheel = () => {
      wheeling = true;
      // Tells AdaptiveDpr to drop to the lower bound of the dpr range.
      performance.regress();
      if (idleTimer != null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        wheeling = false;
        idleTimer = null;
        // Final full-DPR frame — performance.current ramps back up on its
        // own once we stop calling regress().
        invalidate();
      }, WHEEL_IDLE_MS);
    };

    const onChange = () => {
      if (!wheeling) {
        // Drag interactions: render every change for smooth feedback.
        invalidate();
        return;
      }
      // Wheel zoom: collapse multiple change events per browser frame
      // into a single render. Cheaper than per-event invalidation, and
      // combined with regress() the frame itself is at low DPR.
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        invalidate();
      });
    };

    const onEnd = () => invalidate();

    dom.addEventListener("wheel", onWheel, { passive: true });
    controls.addEventListener("change", onChange);
    controls.addEventListener("end", onEnd);

    return () => {
      if (idleTimer != null) window.clearTimeout(idleTimer);
      if (rafId != null) cancelAnimationFrame(rafId);
      dom.removeEventListener("wheel", onWheel);
      controls.removeEventListener("change", onChange);
      controls.removeEventListener("end", onEnd);
      controls.dispose();
      set({ controls: null });
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate, set, performance]);

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
