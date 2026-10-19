import type { FreeInput, FreePose } from "./free-cam";
import { AT_REST, kickFor, springTo, type Spring } from "./spring";

// The camera as an operator carries it. The body walks (model/walk.ts) and every
// ray leaves from it; the eye rides over it with a lag, a dip, a bob and, at a
// run, a wider view. All of it in metres and degrees: the rig scales it into the
// scene by unitRatio. Every knob of it is in this file.

/** The eye catches a body that snapped up or down a step in about 120 ms, never overshooting (ω, rad/s). */
const EYE_OMEGA = 40;
/** How fast the run's wider view comes and goes (ω, rad/s): about half a second. */
const FOV_OMEGA = 10;
/** Under these an offset (m) and its speed (m/s), and the view's kick (°, °/s), are none: the spring is at rest. */
const REST_M = 1e-4;
const REST_MPS = 1e-3;
const REST_DEG = 1e-3;
const REST_DEG_PS = 1e-2;
/** A landing's or take-off's sag turns about 60 ms after the kick and swings back ~10 % past level (ω, ζ). */
const DIP_OMEGA = 20;
const DIP_ZETA = 0.6;
/** A landing sags the eye this much per m/s of impact (a 0.5 m jump lands at ~3 m/s: ~7 cm), never deeper than the cap (m). */
const LAND_DIP_PER_MPS = 0.022;
const LAND_DIP_MAX_M = 0.25;
/** A take-off crouches the eye this deep (m), the body already rising: the jump itself is never late. */
const TAKE_OFF_DIP_M = 0.035;

/**
 * The eye over the body. `eye` is its lag behind a step, `dip` a landing's or a
 * take-off's sag, `bob` the walk's depth of bob and `phase` the steps taken
 * (metres, steps); `fov` the degrees the view is wider than the base.
 */
export type Feel = { walking: boolean; eye: Spring; dip: Spring; bob: Spring; phase: number; fov: Spring };

export const REST_FEEL: Feel = { walking: false, eye: AT_REST, dip: AT_REST, bob: AT_REST, phase: 0, fov: AT_REST };

/** One frame: its length in seconds, metres per scene unit, and whether the rig walks. */
export type FeelFrame = { dt: number; unitRatio: number; walking: boolean };

const standing = (p: FreePose) => p.vy === undefined;

const rested = (s: Spring, x: number, v: number): Spring => (Math.abs(s.x) < x && Math.abs(s.v) < v ? AT_REST : s);

/** A snap of the body on the ground (a step up or down) goes into the lag, and the lag springs home. */
function eyeAfter(eye: Spring, prev: FreePose, next: FreePose, f: FeelFrame): Spring {
  const snap = f.walking && standing(prev) && standing(next) ? (next.position.y - prev.position.y) * f.unitRatio : 0;
  return springTo({ x: eye.x - snap, v: eye.v }, 0, EYE_OMEGA, 1, f.dt);
}

/** How deep this frame sags the eye: a landing by its impact, a take-off by a crouch; 0 when neither happened. */
function dipDepth(prev: FreePose, next: FreePose, f: FeelFrame): number {
  if (!standing(prev) && standing(next)) {
    return Math.min(LAND_DIP_PER_MPS * Math.max(0, -(prev.vy ?? 0)) * f.unitRatio, LAND_DIP_MAX_M);
  }
  return standing(prev) && (next.vy ?? 0) > 0 ? TAKE_OFF_DIP_M : 0;
}

/** The sag one frame on: a kick by the depth read off the poses, then the spring home. Walking only, and never under reduced motion. */
function dipAfter(dip: Spring, prev: FreePose, next: FreePose, input: FreeInput, f: FeelFrame): Spring {
  const depth = f.walking && !input.instant ? dipDepth(prev, next, f) : 0;
  const v = depth > 0 ? dip.v + kickFor(-depth, DIP_OMEGA, DIP_ZETA) : dip.v;
  return rested(springTo({ x: dip.x, v }, 0, DIP_OMEGA, DIP_ZETA, f.dt), REST_M, REST_MPS);
}

/** The view's kick, a frame on towards none. */
export const fovHome = (fov: Spring, dt: number): Spring =>
  rested(springTo(fov, 0, FOV_OMEGA, 1, dt), REST_DEG, REST_DEG_PS);

/**
 * The eye one frame on, the body having gone from `prev` to `next`. What
 * happened is read off the two poses — a landing, a take-off, a step — so the
 * physics hands over nothing more than the poses it already makes. A walk begun
 * or ended starts the eye level with the pose; the view's kick eases on.
 */
export function stepFeel(feel: Feel, prev: FreePose, next: FreePose, input: FreeInput, f: FeelFrame): Feel {
  if (!(f.dt > 0)) return feel;
  const from = feel.walking === f.walking ? feel : { ...REST_FEEL, walking: f.walking, fov: feel.fov };
  return {
    ...from,
    eye: rested(eyeAfter(from.eye, prev, next, f), REST_M, REST_MPS),
    dip: dipAfter(from.dip, prev, next, input, f),
    fov: fovHome(from.fov, f.dt),
  };
}

/** How far the eye sits over the pose, in metres; under it when negative. */
export const eyeOffsetM = (feel: Feel) =>
  feel.eye.x + feel.dip.x - (feel.bob.x * (1 - Math.cos(2 * Math.PI * feel.phase))) / 2;

/** Degrees the view is wider than the base. */
export const fovKickDeg = (feel: Feel) => feel.fov.x;

/** Nothing left moving: the rig may stop asking for frames. */
export const feelAtRest = (feel: Feel) => [feel.eye, feel.dip, feel.bob, feel.fov].every((s) => s.x === 0 && s.v === 0);
