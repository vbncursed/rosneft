import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import type { FreeInput, FreePose } from "../model/free-cam";
import type { Spring } from "../model/spring";
import { eyeOffsetM, feelAtRest, fovHome, fovKickDeg, REST_FEEL, stepFeel, type Feel } from "../model/walk-feel";
import { applyPose, setFov } from "./free-cam-writes";

/** The camera over the free cam's body: the walk's lag, dip, bob and wider view (model/walk-feel.ts). */
export type WalkFeel = {
  /** One frame from `prev` to `next`; the pose to keep. On the frame a walk ends it moves up to where the eye was. */
  step: (prev: FreePose, next: FreePose, input: FreeInput, dt: number, walking: boolean) => FreePose;
  /** The camera at `pose`, with the eye's offset and the view's kick on top. */
  apply: (pose: FreePose) => void;
  /** Where `pose` puts the camera: what a camera moved from outside is told apart by. */
  shown: (pose: FreePose) => FreePose;
  /** The offset dropped: the camera was moved from outside. The view's kick still eases home. */
  rest: () => void;
  /** Something still settles: the rig asks for another frame. */
  live: () => boolean;
};

const lift = (pose: FreePose, dy: number): FreePose =>
  dy === 0 ? pose : { ...pose, position: pose.position.clone().setY(pose.position.y + dy) };

// One release across mounts: a free cam entered again while the last one's view
// still eases home first puts it home, then reads the base.
let endRelease: (() => void) | null = null;

/** Ends a view still easing home, at home. */
export function stopFovHome() {
  endRelease?.();
}

/** The view eased from `kick` degrees over `base` back to it on its own frames: the free cam that drew it has gone. */
export function easeFovHome(camera: PerspectiveCamera, base: number, kick: Spring, invalidate: () => void) {
  stopFovHome();
  let s = kick;
  let last: number | null = null;
  let frame = 0;
  const done = () => {
    cancelAnimationFrame(frame);
    endRelease = null;
    setFov(camera, base);
    invalidate();
  };
  const tick = (now: number) => {
    s = fovHome(s, last === null ? 0 : (now - last) / 1000);
    last = now;
    if (s.x === 0 && s.v === 0) {
      done();
      return;
    }
    setFov(camera, base + s.x);
    invalidate();
    frame = requestAnimationFrame(tick);
  };
  endRelease = done;
  frame = requestAnimationFrame(tick);
}

/**
 * The walk's camera as an operator carries it. The body (the rig's pose) is
 * what the physics moves and casts from; this only says where the camera is
 * shown over it, in scene units through `unitRatio`. On the way out of the free
 * cam the view eases home on its own frames; the camera stays where it was shown.
 */
export function useWalkFeel(camera: PerspectiveCamera, unitRatio: number): WalkFeel {
  const invalidate = useThree((s) => s.invalidate);
  const feel = useRef<Feel>(REST_FEEL);
  const base = useRef(camera.fov);

  useEffect(() => {
    stopFovHome();
    base.current = camera.fov;
    return () => {
      const { fov } = feel.current;
      feel.current = REST_FEEL;
      if (fov.x !== 0 || fov.v !== 0) easeFovHome(camera, base.current, fov, invalidate);
    };
  }, [camera, invalidate]);

  return useMemo(() => {
    const shown = (pose: FreePose) => lift(pose, eyeOffsetM(feel.current) / unitRatio);
    return {
      step(prev, next, input, dt, walking) {
        const kept = feel.current.walking && !walking ? shown(next) : next;
        feel.current = stepFeel(feel.current, prev, next, input, { dt, unitRatio, walking });
        return kept;
      },
      apply(pose) {
        applyPose(camera, shown(pose));
        const fov = base.current + fovKickDeg(feel.current);
        if (camera.fov !== fov) setFov(camera, fov);
      },
      shown,
      rest() {
        feel.current = { ...REST_FEEL, walking: feel.current.walking, fov: feel.current.fov };
      },
      live: () => !feelAtRest(feel.current),
    };
  }, [camera, unitRatio]);
}
