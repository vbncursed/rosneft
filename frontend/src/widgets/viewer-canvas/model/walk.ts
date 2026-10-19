import { Vector3 } from "three";
import { EYE_HEIGHT_M } from "@/entities/measurement";
import { easeVelocity, type FreeInput, type FreePose } from "./free-cam";

/** The tallest rise a step climbs, and the deepest drop the feet stick to, in metres: a kerb yes, a tank wall no. */
const STEP_M = 0.5;
export const WALK_MPS = 1.4;
export const RUN_MPS = 4;
/** A person's depth range in metres: a hand's width to a horizon a couple of km off. */
const WALK_NEAR_M = 0.1;
const WALK_FAR_M = 2000;
/** The first wall probe runs this far over a step's height: a thin rail no step climbs is caught there. */
const OVER_STEP_M = 0.02;
/** The wall probes' heights over the feet: the knee, over any rise a step climbs, then the chest. */
const KNEE_M = STEP_M + 0.2;
const CHEST_M = 1.2;
/** Half a person's width: how near a wall the walker comes head-on. */
const BODY_M = 0.3;
const GRAVITY_MPS2 = 9.8;
/** The fastest a fall gets, in metres a second. */
const TERMINAL_MPS = 30;
/** How high a jump lifts the feet, in metres. */
const JUMP_M = 0.5;
/** On the ground the velocity closes ~63 % of the gap to the wish in this many seconds: a short lean in and out. */
const GROUND_EASE_S = 0.08;
/** In the air the velocity turns towards the wish by at most this share of the wish's speed a second. */
const AIR_CONTROL = 0.3;

/** The body in scene units: a metre is 1 / unitRatio of them; gravity, terminal speed and jump likewise per second. */
export type WalkScale = {
  eye: number;
  step: number;
  knee: number;
  chest: number;
  body: number;
  overStep: number;
  gravity: number;
  terminal: number;
  jump: number;
};
/** The surface under (x, z) seen from `fromY` straight down; null when there is none. */
export type GroundAt = (x: number, z: number, fromY: number) => number | null;
/** Is there a surface within `reach` of `from` along `dir` (a horizontal unit vector)? */
export type WallAt = (from: Vector3, dir: Vector3, reach: number) => boolean;
export type WalkWorld = { dt: number; speed: number; scale: WalkScale; groundAt: GroundAt; wallAt: WallAt };

export const walkScale = (unitRatio: number): WalkScale => ({
  eye: EYE_HEIGHT_M / unitRatio,
  step: STEP_M / unitRatio,
  knee: KNEE_M / unitRatio,
  chest: CHEST_M / unitRatio,
  body: BODY_M / unitRatio,
  overStep: OVER_STEP_M / unitRatio,
  gravity: GRAVITY_MPS2 / unitRatio,
  terminal: TERMINAL_MPS / unitRatio,
  jump: Math.sqrt(2 * GRAVITY_MPS2 * JUMP_M) / unitRatio,
});

export const walkSpeed = (unitRatio: number, multiplier: number) => (WALK_MPS / unitRatio) * multiplier;

export const walkClip = (unitRatio: number, flyingFar: number) => ({
  near: WALK_NEAR_M / unitRatio,
  far: Math.min(WALK_FAR_M / unitRatio, flyingFar),
});

/**
 * Nothing in the way along (dx, dz). The first probe is level just over a step
 * and runs the frame's own move, so a thin rail no step climbs is caught on
 * every stretch of the move, not only where its face is; the knee and the
 * chest then see the walls that stand higher, as far as the step and the body.
 * The ray down cannot see a wall it starts below, nor one with ground behind
 * it; these level rays can.
 */
function clearAhead(w: WalkWorld, eye: Vector3, dx: number, dz: number): boolean {
  const step = Math.hypot(dx, dz);
  if (step === 0) return true;
  const dir = new Vector3(dx / step, 0, dz / step);
  const feet = eye.y - w.scale.eye;
  if (w.wallAt(new Vector3(eye.x, feet + w.scale.step + w.scale.overStep, eye.z), dir, step)) return false;
  const reach = step + w.scale.body;
  return [w.scale.knee, w.scale.chest].every((h) => !w.wallAt(new Vector3(eye.x, feet + h, eye.z), dir, reach));
}

/**
 * The ground under (x, z) as the feet see it, looked for from the knee: a ray
 * from a step up starts inside any block taller than that and finds the floor
 * under it, so the walker walks through.
 */
function groundUnder(w: WalkWorld, x: number, z: number, feet: number): number | null {
  return w.groundAt(x, z, feet + w.scale.knee);
}

/** Ground the feet may step onto by (dx, dz): found from the knee, no higher than a step, no wall in the way. */
function footing(w: WalkWorld, eye: Vector3, dx: number, dz: number): number | null {
  const feet = eye.y - w.scale.eye;
  const ground = groundUnder(w, eye.x + dx, eye.z + dz, feet);
  if (ground === null || ground - feet > w.scale.step) return null;
  return clearAhead(w, eye, dx, dz) ? ground : null;
}

/** Where (dx, dz) takes the walker — the whole step, else X alone, else Z alone, so it slides along a wall — and the ground there; null when every try is blocked. */
function slide(w: WalkWorld, eye: Vector3, dx: number, dz: number): { x: number; z: number; ground: number } | null {
  for (const [sx, sz] of [
    [dx, dz],
    [dx, 0],
    [0, dz],
  ]) {
    const ground = footing(w, eye, sx, sz);
    if (ground !== null) return { x: eye.x + sx, z: eye.z + sz, ground };
  }
  return null;
}

/** The keys' wish along the ground towards the yaw (the pitch only looks), run with Shift. */
function walkWish(yaw: number, input: FreeInput, speed: number): Vector3 {
  const wish = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    .multiplyScalar(input.forward)
    .addScaledVector(new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), input.right);
  if (wish.lengthSq() > 1) wish.normalize();
  return wish.multiplyScalar(speed * (input.boost ? RUN_MPS / WALK_MPS : 1));
}

/** In the air: the take-off velocity kept, turned towards the wish by AIR_CONTROL of its speed a second at most. */
function steer(from: Vector3, wish: Vector3, dt: number): Vector3 {
  const turn = wish
    .clone()
    .sub(from)
    .clampLength(0, wish.length() * AIR_CONTROL * dt);
  return from.clone().add(turn);
}

/**
 * The feet one frame on, and the speed up while off the ground (undefined:
 * standing). Standing, the feet stick to ground up to a step below and jump
 * on request; off it, gravity pulls — exactly, whatever the frame rate — no
 * faster than terminal, until the feet meet the ground.
 */
function rise(feet: number, ground: number, vy: number | undefined, jump: boolean, w: WalkWorld) {
  let lift = vy;
  let from = feet;
  if (lift === undefined && jump) {
    lift = w.scale.jump;
    from = Math.max(feet, ground); // a step climbed this frame: the walker jumps from its new height
  } else if (lift === undefined && feet - ground > w.scale.step) lift = 0;
  if (lift === undefined) return { feet: ground, vy: undefined };
  const v = Math.max(lift - w.scale.gravity * w.dt, -w.scale.terminal);
  const next = from + ((lift + v) / 2) * w.dt;
  return next <= ground ? { feet: ground, vy: undefined } : { feet: next, vy: v };
}

/**
 * One frame of walking: along the ground towards the yaw, up a rise no taller
 * than a step, never onto one taller, into a wall or off the territory's edge;
 * blocked, each axis is tried alone (it slides). Space leaves the ground, and
 * off it the walker keeps its momentum under gravity. The ground under the
 * feet is read every frame, standing too: what held them may have gone.
 */
export function stepWalk(pose: FreePose, input: FreeInput, w: WalkWorld): FreePose {
  // A frame that is not a number (a broken dt) is no frame: nothing moves, nothing is cast.
  if (!(w.dt > 0)) return pose;
  const wish = walkWish(pose.yaw, input, w.speed);
  const velocity =
    pose.vy === undefined
      ? easeVelocity(pose.velocity, wish, w.dt, input.instant, w.speed, GROUND_EASE_S)
      : steer(pose.velocity, wish, w.dt);
  const eye = pose.position;
  const feet = eye.y - w.scale.eye;
  const dx = velocity.x * w.dt;
  const dz = velocity.z * w.dt;
  const moved = dx !== 0 || dz !== 0 ? slide(w, eye, dx, dz) : null;
  const x = moved?.x ?? eye.x;
  const z = moved?.z ?? eye.z;
  const ground = moved ? moved.ground : (groundUnder(w, x, z, feet) ?? pose.ground ?? feet);
  const body = rise(feet, ground, pose.vy, input.jump, w);
  return { ...pose, velocity, ground, vy: body.vy, position: new Vector3(x, body.feet + w.scale.eye, z) };
}
