import { Vector3 } from "three";
import { EYE_HEIGHT_M } from "@/entities/measurement";
import { easeVelocity, type FreeInput, type FreePose } from "./free-cam";

/** The tallest rise a step climbs, in metres: a kerb yes, a tank wall no. */
const STEP_M = 0.5;
const WALK_MPS = 1.4;
const RUN_MPS = 4;
/** The fastest the walker sinks to lower ground, in metres a second. */
const FALL_MPS = 8;
/** A person's depth range in metres: a hand's width to a horizon a couple of km off. */
const WALK_NEAR_M = 0.1;
const WALK_FAR_M = 2000;
/** The wall probe's two heights over the feet: over any rise a step climbs, then the chest. */
const KNEE_M = STEP_M + 0.2;
const CHEST_M = 1.2;
/** Half a person's width: how near a wall the walker comes head-on. */
const BODY_M = 0.3;

/** Eye height, step, fall speed and the wall probe's heights and body in scene units: a metre is 1 / unitRatio of them. */
export type WalkScale = { eye: number; step: number; fall: number; knee: number; chest: number; body: number };
/** The surface under (x, z) seen from `fromY` straight down; null when there is none. */
export type GroundAt = (x: number, z: number, fromY: number) => number | null;
/** Is there a surface within `reach` of `from` along `dir` (a horizontal unit vector)? */
export type WallAt = (from: Vector3, dir: Vector3, reach: number) => boolean;
export type WalkWorld = { dt: number; speed: number; scale: WalkScale; groundAt: GroundAt; wallAt: WallAt };

export const walkScale = (unitRatio: number): WalkScale => ({
  eye: EYE_HEIGHT_M / unitRatio,
  step: STEP_M / unitRatio,
  fall: FALL_MPS / unitRatio,
  knee: KNEE_M / unitRatio,
  chest: CHEST_M / unitRatio,
  body: BODY_M / unitRatio,
});

export const walkSpeed = (unitRatio: number, multiplier: number) => (WALK_MPS / unitRatio) * multiplier;

export const walkClip = (unitRatio: number, flyingFar: number) => ({
  near: WALK_NEAR_M / unitRatio,
  far: Math.min(WALK_FAR_M / unitRatio, flyingFar),
});

/**
 * Nothing at the knee or the chest along (dx, dz), as far as the step and the
 * body. The ray down cannot see a wall it starts below, nor one with ground
 * behind it; this level ray can. Knee first: most walls end there.
 */
function clearAhead(w: WalkWorld, eye: Vector3, dx: number, dz: number): boolean {
  const step = Math.hypot(dx, dz);
  if (step === 0) return true;
  const dir = new Vector3(dx / step, 0, dz / step);
  const feet = eye.y - w.scale.eye;
  const reach = step + w.scale.body;
  return [w.scale.knee, w.scale.chest].every((h) => !w.wallAt(new Vector3(eye.x, feet + h, eye.z), dir, reach));
}

/** Ground the feet may step onto by (dx, dz): found from one step up, no higher than it, no wall in the way. */
function footing(w: WalkWorld, eye: Vector3, dx: number, dz: number): number | null {
  const feet = eye.y - w.scale.eye;
  const ground = w.groundAt(eye.x + dx, eye.z + dz, feet + w.scale.step);
  if (ground === null || ground - feet > w.scale.step) return null;
  return clearAhead(w, eye, dx, dz) ? ground : null;
}

/**
 * One frame of walking: along the ground towards the yaw (the pitch only
 * looks), up a rise no taller than a step, never onto one taller, into a
 * wall or off the territory's edge. Blocked, each axis is tried alone — X,
 * then Z — so the walker slides along a wall. Lower ground is reached at
 * FALL_MPS at most.
 */
export function stepWalk(pose: FreePose, input: FreeInput, w: WalkWorld): FreePose {
  const { yaw } = pose;
  const wish = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    .multiplyScalar(input.forward)
    .addScaledVector(new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), input.right);
  if (wish.lengthSq() > 1) wish.normalize();
  wish.multiplyScalar(w.speed * (input.boost ? RUN_MPS / WALK_MPS : 1));
  const velocity = easeVelocity(pose.velocity, wish, w.dt, input.instant, w.speed);
  const feet = pose.position.y - w.scale.eye;
  let { x, z } = pose.position;
  let ground = pose.ground ?? feet;
  const dx = velocity.x * w.dt;
  const dz = velocity.z * w.dt;
  // A step that is not a number (a broken dt) stands still and casts nothing.
  if ((dx !== 0 || dz !== 0) && Number.isFinite(dx + dz)) {
    const eye = pose.position;
    const both = footing(w, eye, dx, dz);
    const alongX = both === null ? footing(w, eye, dx, 0) : null;
    const alongZ = both === null && alongX === null ? footing(w, eye, 0, dz) : null;
    if (both !== null) [x, z, ground] = [x + dx, z + dz, both];
    else if (alongX !== null) [x, ground] = [x + dx, alongX];
    else if (alongZ !== null) [z, ground] = [z + dz, alongZ];
  }
  const landed = ground >= feet ? ground : Math.max(ground, feet - w.scale.fall * w.dt);
  return { ...pose, velocity, ground, position: new Vector3(x, landed + w.scale.eye, z) };
}
