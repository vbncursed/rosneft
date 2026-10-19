import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Object3D, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { landingPivot } from "../model/flight-pose";
import {
  CLICK_SLOP_PX,
  clipPlanes,
  drifted,
  freeInput,
  freeSpeed,
  JUMP_KEY,
  lookStep,
  nextMultiplier,
  poseOf,
  stepFreeCam,
  type FreePose,
} from "../model/free-cam";
import { stepWalk, walkSpeed } from "../model/walk";
import { boundsOf } from "./bounds";
import { applyPose, setClip, setCursor, setEnabled } from "./free-cam-writes";
import { useAutoLodBus } from "./settle-bus";
import { holdStill } from "./stop-coast";
import { useHeldKeys } from "./use-held-keys";
import { useWalk } from "./use-walk";

/** The most one frame moves the camera: a lost frame slows the flight, never teleports it (Play's MAX_STEP_MS). */
const MAX_STEP_S = 0.1;
/** No mesh to measure yet: the converter's normalised scene is about this big. */
const FALLBACK_RADIUS = 1;
/** Left and right drag to look; the middle button is left alone. */
const LOOK_BUTTONS = new Set([0, 2]);
/** Firefox reports a wheel notch in lines. */
const LINE_PX = 16;

type Drag = { id: number; startX: number; startY: number; x: number; y: number; looking: boolean };

type FreeCamRigProps = {
  /** The territory: its size sets the flight's speed and where the orbit lands. */
  sceneRef: RefObject<Object3D | null>;
  /** Everything the walker stands on and runs into: the scene wrapper — the territory and every placement drawn. */
  solidRef: RefObject<Object3D | null>;
  /** G: walk at eye height over the territory instead of flying. */
  walk: boolean;
  /** Metres per scene unit (computeUnitRatio): the walk's eye, step and speeds are in metres. */
  unitRatio: number;
  /** Nothing to stand on under the camera: the page goes back to flying. */
  onWalkRefused: () => void;
};

/**
 * Free cam: WASD/QE fly, Shift ×4, Space jumps while walking, the wheel scales
 * the speed, a left or right drag looks (the cursor stays, so the panels stay usable). Mounted by
 * SceneCanvas while the page says `free`, inside AutoLodClock.
 *
 * OrbitControls is switched off, not torn down, and is never asked to update
 * mid-flight — update() would pull the camera back onto its old orbit. Auto
 * LOD hears the camera move through the settle bus instead. On the way out
 * the orbit pivots on the territory along the line of sight, as Play lands.
 *
 * Walking (G) is the same rig moving another way: `useWalk` stands the camera
 * at eye height and `stepWalk` keeps it there, frame by frame.
 */
export default function FreeCamRig({ sceneRef, solidRef, walk, unitRatio, onWalkRefused }: FreeCamRigProps) {
  const instant = useMediaQuery("(prefers-reduced-motion: reduce)");
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const bus = useAutoLodBus();
  const pose = useRef<FreePose | null>(null);
  const speed = useRef({ radius: FALLBACK_RADIUS, multiplier: 1 });
  // drei's Bounds fit moves the camera for about a second after mount or Focus:
  // a flight starts from where the camera is, not from the pose taken earlier.
  const resync = useCallback(() => {
    const current = pose.current;
    if (!current) return;
    const now = poseOf(camera.position, camera.quaternion);
    if (drifted(current, now, speed.current.radius)) pose.current = now;
  }, [camera]);
  // Before the setup effect below, on purpose: see useWalk on the cleanup order.
  const restartSpeed = useCallback(() => {
    speed.current.multiplier = 1;
  }, []);
  const flyingClip = useCallback(() => clipPlanes(speed.current.radius), []);
  const walking = useWalk({
    walk,
    unitRatio,
    solidRef,
    pose,
    restartSpeed,
    onRefused: onWalkRefused,
    flying: flyingClip,
  });
  const press = useCallback(() => {
    resync();
    invalidate();
  }, [resync, invalidate]);
  const canJump = () => walking.current !== null;
  const keys = useHeldKeys(press, canJump);

  useEffect(() => {
    if (!controls) return;
    const scale = speed.current;
    const held = keys.current;
    const sphere = boundsOf(sceneRef.current);
    scale.radius = sphere?.radius ?? FALLBACK_RADIUS;
    holdStill(controls, camera);
    setEnabled(controls, false);
    // A walk already on at mount (a canvas remount mid-walk) ran its effect first: the orbit's planes are the ones it took.
    const walked = walking.current;
    const saved = walked ? walked.before : { near: camera.near, far: camera.far };
    setClip(camera, walked ? walked.clip() : clipPlanes(scale.radius));
    pose.current = poseOf(camera.position, camera.quaternion);
    invalidate();
    return () => {
      held.clear();
      const sight = camera.getWorldDirection(new Vector3());
      const around = sphere ?? { center: camera.position, radius: FALLBACK_RADIUS };
      controls.target.copy(landingPivot(camera.position, sight, around));
      setClip(camera, saved);
      setEnabled(controls, true);
      // Fires "change": AutoLodClock re-reads the view, CameraRig repaints.
      // The pivot is on the line of sight, so the look-at inside turns nothing.
      controls.update();
    };
  }, [controls, camera, sceneRef, invalidate, walking, pose, keys]);

  useEffect(() => {
    if (!controls) return;
    const canvas = gl.domElement;
    let drag: Drag | null = null;
    // The free cam owns the pointer. A drag that handed the orbit back in the
    // meantime (a calibration ring's drop sets enabled = true) is overruled
    // here, in the capture phase — ahead of OrbitControls' own listener.
    const own = () => setEnabled(controls, false);
    const down = (e: PointerEvent) => {
      own();
      if (!LOOK_BUTTONS.has(e.button) || drag) return;
      resync();
      drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, looking: false };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      setCursor(canvas, "grab");
      canvas.releasePointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const current = pose.current;
      if (!drag || e.pointerId !== drag.id || !current) return;
      // No button down: the release never arrived, so the look ends here.
      if (e.buttons === 0) {
        up(e);
        return;
      }
      // Under the slop a press is still a click: R3F hands the pick to the placement.
      if (!drag.looking && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < CLICK_SLOP_PX) return;
      if (!drag.looking) setCursor(canvas, "grabbing");
      drag.looking = true;
      pose.current = lookStep(current, e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX;
      drag.y = e.clientY;
      applyPose(camera, pose.current);
      bus.settle();
      invalidate();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      own();
      const px = e.deltaY * (e.deltaMode === 1 ? LINE_PX : 1);
      speed.current.multiplier = nextMultiplier(speed.current.multiplier, px);
    };
    // A right drag looks; the menu its release would open is not wanted.
    const menu = (e: Event) => e.preventDefault();
    setCursor(canvas, "grab");
    canvas.addEventListener("pointerdown", down, { capture: true });
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
    canvas.addEventListener("contextmenu", menu);
    return () => {
      canvas.removeEventListener("pointerdown", down, { capture: true });
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel, { capture: true });
      canvas.removeEventListener("contextmenu", menu);
      setCursor(canvas, "");
    };
  }, [controls, gl, camera, bus, invalidate, resync]);

  // frameloop="demand": a frame runs only when asked, so the flight asks for
  // the next one for as long as anything is still moving.
  useFrame((_, delta) => {
    const current = pose.current;
    if (!current) return;
    const dt = Math.min(delta, MAX_STEP_S);
    const input = { ...freeInput(keys.current), instant };
    // A Space is one jump: this frame takes it, or it is spent in the air and gone.
    keys.current.delete(JUMP_KEY);
    const { radius, multiplier } = speed.current;
    const ground = walking.current; // scale, groundAt and wallAt in one
    const next = ground
      ? stepWalk(current, input, { dt, speed: walkSpeed(unitRatio, multiplier), ...ground })
      : stepFreeCam(current, input, dt, freeSpeed(radius, multiplier));
    pose.current = next;
    // At rest only when nothing eases out and nothing is still sinking to lower ground.
    if (next.velocity.lengthSq() === 0 && next.position.equals(current.position)) return;
    applyPose(camera, next);
    bus.settle();
    invalidate();
  });

  return null;
}
