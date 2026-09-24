import { useEffect, useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Sphere, Vector3, type Object3D, type PerspectiveCamera } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { coveredShare, flightPose, landingPivot, planFlight, sideOffset } from "../model/flight-pose";
import { holdStill, stopCoast } from "./stop-coast";

interface CameraRigProps {
  resetVersion: number;
  /** Play: the fly-around is on. */
  playing: boolean;
  /** The flight ended here — a grab, or nothing to circle; the page turns Play off. */
  onPlayStop: () => void;
  /**
   * What the flight circles: the territory's own group, not the scene
   * wrapper — a placement parked far outside the mesh must not widen the circle.
   */
  sceneRef: RefObject<Object3D | null>;
}

/** The territory's bounding sphere, or null when there is nothing with a size to circle. */
function boundsOf(object: Object3D | null): Sphere | null {
  if (!object) return null;
  const sphere = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
  return sphere.radius > 0 && Number.isFinite(sphere.radius) ? sphere : null;
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

/** The most one frame moves the flight's clock: a lost frame slows it, never skips it. */
const MAX_STEP_MS = 100;
/** Seconds the aim takes to follow the Overlays panel folding or opening mid-flight. */
const FOLLOW_S = 0.2;

/**
 * The share of the canvas the open Overlays panel hides. The panel marks its
 * open face `data-canvas-cover` (widgets/overlays-panel); the rail it folds to
 * does not, so a folded panel hides nothing here.
 */
function panelShare(canvas: HTMLElement): number {
  const cover = document.querySelector("[data-canvas-cover]");
  return coveredShare(canvas.getBoundingClientRect(), cover ? cover.getBoundingClientRect().left : null);
}

export default function CameraRig({ resetVersion, playing, onPlayStop, sceneRef }: CameraRigProps) {
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

  // Play. Our own frame loop moves the camera, since frameloop="demand" draws
  // only what is asked for, and OrbitControls is left alone meanwhile. Its
  // "start" (pointer, wheel, touch) is therefore the reader grabbing the view;
  // "change" cannot be, because our own update() fires it. A gizmo or marker
  // drag takes the controls without a "start", by switching them off.
  // Either way the camera stays where it was caught. The page lands the flight
  // itself on Reset, Focus, a panorama or a mode change, by turning `playing` off.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!playing || !controls) return;
    const sphere = boundsOf(sceneRef.current);
    if (!sphere) {
      onPlayStop();
      return;
    }
    // A flick's leftover coast would turn the view under the flight.
    holdStill(controls, camera);
    const lens = camera as PerspectiveCamera;
    const view = () => ({ fov: lens.fov, aspect: lens.aspect, share: panelShare(gl.domElement) });
    const flight = planFlight({ position: camera.position, target: controls.target }, sphere, view(), still);
    let frame = 0;
    // The flight's own clock, advanced frame by frame: a hidden tab runs no
    // frames, and an absolute one jumped by the whole time away on return.
    let clock = 0;
    let last: number | null = null;
    // However it ends, the orbit takes over pivoting on the territory, never
    // on the rise's own target, which can sit below the ground.
    const land = () => {
      cancelAnimationFrame(frame);
      controls.removeEventListener("start", grab);
      const view = camera.getWorldDirection(new Vector3());
      controls.target.copy(landingPivot(camera.position, view, sphere));
    };
    const grab = () => {
      holdStill(controls, camera);
      land();
      onPlayStop();
    };
    const tick = (now: number) => {
      if (!controls.enabled) {
        grab();
        return;
      }
      const step = Math.min(now - (last ?? now), MAX_STEP_MS) / 1000;
      clock += step;
      last = now;
      flight.offset += (sideOffset(flight.distance, view()) - flight.offset) * Math.min(1, step / FOLLOW_S);
      const pose = flightPose(clock, flight);
      camera.position.copy(pose.position);
      controls.target.copy(pose.target);
      camera.lookAt(pose.target);
      invalidate();
      frame = requestAnimationFrame(tick);
    };
    controls.addEventListener("start", grab);
    frame = requestAnimationFrame(tick);
    return land;
  }, [playing, still, camera, gl, invalidate, sceneRef, onPlayStop]);

  return null;
}
