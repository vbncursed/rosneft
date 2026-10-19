import { MathUtils } from "three";
import type { FreeInput, FreePose } from "./free-cam";
import { AT_REST, kickFor, springTo, type Spring } from "./spring";
import { RUN_MPS, WALK_MPS } from "./walk";

// The camera as an operator carries it. The body walks (model/walk.ts) and every
// ray leaves from it; the eye rides over it with a lag, a dip, a bob and, at a
// run, a wider view. All of it in metres and degrees: the rig scales it into the
// scene by unitRatio. Every knob of it is in this file.

/** The eye catches a body that snapped up or down a step in about 190 ms, never overshooting (ω, rad/s). */
const EYE_OMEGA = 25;
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
/** The bob's depth, peak to peak, walking and running, and the steps a second that drive it. */
const BOB_WALK_M = 0.015;
const BOB_RUN_M = 0.025;
const WALK_STEPS_HZ = 1.9;
const RUN_STEPS_HZ = 2.8;
/** How fast the bob swells and fades (ω, rad/s): gone about half a second after the walker stops. */
const BOB_OMEGA = 10;
/** Slower than this along the ground the walker stands: no bob, no wider view (m/s). */
const MOVING_MPS = 0.1;
/** The run's wider view, in degrees over the base. */
const FOV_KICK_DEG = 3;

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

/** Metres a second the body really went along the ground: a walker held against a wall does not bob. */
const pace = (prev: FreePose, next: FreePose, f: FeelFrame) =>
  (Math.hypot(next.position.x - prev.position.x, next.position.z - prev.position.z) * f.unitRatio) / f.dt;

/** 0 at a walk, 1 at a run, linear in between. */
const runShare = (mps: number) => MathUtils.clamp((mps - WALK_MPS) / (RUN_MPS - WALK_MPS), 0, 1);

/** The bob's depth eased towards the pace's, and the steps it has taken; none in the air, standing, or under reduced motion. */
function bobAfter(
  feel: Feel,
  mps: number,
  next: FreePose,
  input: FreeInput,
  f: FeelFrame,
): Pick<Feel, "bob" | "phase"> {
  const on = f.walking && !input.instant && standing(next) && mps > MOVING_MPS;
  const run = runShare(mps);
  const depth = on ? MathUtils.lerp(BOB_WALK_M, BOB_RUN_M, run) * Math.min(1, mps / WALK_MPS) : 0;
  const bob =
    depth === 0
      ? rested(springTo(feel.bob, 0, BOB_OMEGA, 1, f.dt), REST_M, REST_MPS)
      : springTo(feel.bob, depth, BOB_OMEGA, 1, f.dt);
  const phase = (feel.phase + MathUtils.lerp(WALK_STEPS_HZ, RUN_STEPS_HZ, run) * f.dt) % 1;
  return { bob, phase: bob === AT_REST ? 0 : phase };
}

/** The run's wider view: towards the kick while Shift drives a walking body along, held in the air, else towards none. */
function fovAfter(fov: Spring, mps: number, prev: FreePose, next: FreePose, input: FreeInput, f: FeelFrame): Spring {
  const on = f.walking && !input.instant && input.boost && mps > MOVING_MPS;
  if (!on) return fovHome(fov, f.dt);
  const airborne = !standing(prev) || !standing(next);
  return springTo(fov, airborne ? fov.x : FOV_KICK_DEG, FOV_OMEGA, 1, f.dt);
}

/**
 * The eye one frame on, the body having gone from `prev` to `next`. What
 * happened is read off the two poses — a landing, a take-off, a step — so the
 * physics hands over nothing more than the poses it already makes. A walk begun
 * or ended starts the eye level with the pose; the view's kick eases on.
 */
export function stepFeel(feel: Feel, prev: FreePose, next: FreePose, input: FreeInput, f: FeelFrame): Feel {
  if (!(f.dt > 0)) return feel;
  const from = feel.walking === f.walking ? feel : { ...REST_FEEL, walking: f.walking, fov: feel.fov };
  const mps = pace(prev, next, f);
  return {
    walking: f.walking,
    eye: rested(eyeAfter(from.eye, prev, next, f), REST_M, REST_MPS),
    dip: dipAfter(from.dip, prev, next, input, f),
    ...bobAfter(from, mps, next, input, f),
    fov: fovAfter(from.fov, mps, prev, next, input, f),
  };
}

/** How far the eye sits over the pose, in metres; under it when negative. */
export const eyeOffsetM = (feel: Feel) =>
  feel.eye.x + feel.dip.x - (feel.bob.x * (1 - Math.cos(2 * Math.PI * feel.phase))) / 2;

/** Degrees the view is wider than the base. */
export const fovKickDeg = (feel: Feel) => feel.fov.x;

/** Nothing left moving: the rig may stop asking for frames. */
export const feelAtRest = (feel: Feel) => [feel.eye, feel.dip, feel.bob, feel.fov].every((s) => s.x === 0 && s.v === 0);
