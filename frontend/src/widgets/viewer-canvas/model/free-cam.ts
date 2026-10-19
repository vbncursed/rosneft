import { Euler, MathUtils, Vector3, type Quaternion } from "three";
import { EYE_HEIGHT_M } from "@/entities/measurement";

/** Under this many pixels between press and release a press is a click (a pick), at or over it a look. */
export const CLICK_SLOP_PX = 4;
/** Radians of turn per pixel dragged. */
const LOOK_RAD_PER_PX = 0.004;
/** Territory radii flown per second at multiplier 1. */
const BASE_SPEED = 0.4;
const BOOST = 4;
const MIN_MULTIPLIER = 0.1;
const MAX_MULTIPLIER = 10;
/** Per pixel of wheel: a 100 px notch is about ×0.82 down or ×1.22 up. */
const WHEEL_RATE = 0.002;
/** Seconds the velocity takes to close ~63 % of the gap to the wish. */
const EASE_S = 0.12;
/** Below this share of the speed a released flight is at rest. */
const REST_SHARE = 0.01;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
/** drei Bounds' own depth range (distance/100 … distance·100), sized by the territory instead. */
const NEAR_SHARE = 1 / 250;
const FAR_SHARE = 40;
/** The tallest rise a step climbs, in metres: a kerb yes, a tank wall no. */
const STEP_M = 0.5;
const WALK_MPS = 1.4;
const RUN_MPS = 4;
/** The fastest the walker sinks to lower ground, in metres a second. */
const FALL_MPS = 8;
/** A person's depth range in metres: a hand's width to a horizon a couple of km off. */
const WALK_NEAR_M = 0.1;
const WALK_FAR_M = 2000;

export type FreePose = {
  position: Vector3;
  yaw: number;
  pitch: number;
  velocity: Vector3;
  /** Walk only: the surface under the feet, in scene units. */
  ground?: number;
};
/** Eye height, step and fall speed in scene units: a metre is 1 / unitRatio of them. */
export type WalkScale = { eye: number; step: number; fall: number };
/** The surface under (x, z) seen from `fromY` straight down; null when there is none. */
export type GroundAt = (x: number, z: number, fromY: number) => number | null;
export type WalkWorld = { dt: number; speed: number; scale: WalkScale; groundAt: GroundAt };
/** Each axis is -1, 0 or 1. `instant`: prefers-reduced-motion — no easing. */
export type FreeInput = { forward: number; right: number; up: number; boost: boolean; instant: boolean };

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"]);

/** `event.code`, not `event.key`: the same physical keys on a Russian layout. */
export const isMoveKey = (code: string) => MOVE_KEYS.has(code);

export function freeInput(held: ReadonlySet<string>): Omit<FreeInput, "instant"> {
  const axis = (plus: string, minus: string) => Number(held.has(plus)) - Number(held.has(minus));
  return {
    forward: axis("KeyW", "KeyS"),
    right: axis("KeyD", "KeyA"),
    up: axis("KeyE", "KeyQ"),
    boost: held.has("ShiftLeft") || held.has("ShiftRight"),
  };
}

export const freeSpeed = (radius: number, multiplier: number) => radius * BASE_SPEED * multiplier;

export const nextMultiplier = (multiplier: number, deltaYPx: number) =>
  MathUtils.clamp(multiplier * Math.exp(-deltaYPx * WHEEL_RATE), MIN_MULTIPLIER, MAX_MULTIPLIER);

export const clipPlanes = (radius: number) => ({ near: radius * NEAR_SHARE, far: radius * FAR_SHARE });

export function poseOf(position: Vector3, quaternion: Quaternion): FreePose {
  const e = new Euler().setFromQuaternion(quaternion, "YXZ");
  return {
    position: position.clone(),
    yaw: e.y,
    pitch: MathUtils.clamp(e.x, -PITCH_LIMIT, PITCH_LIMIT),
    velocity: new Vector3(),
  };
}

/** Territory radii, and radians, a camera may drift before it counts as moved from outside the rig. */
const DRIFT_SHARE = 1e-4;

/** Has the camera moved off the rig's pose? Its own frames never do; drei's Bounds fit does. */
export const drifted = (a: FreePose, b: FreePose, radius: number) =>
  a.position.distanceTo(b.position) > radius * DRIFT_SHARE ||
  Math.abs(a.yaw - b.yaw) > DRIFT_SHARE ||
  Math.abs(a.pitch - b.pitch) > DRIFT_SHARE;

export const lookStep = (pose: FreePose, dx: number, dy: number): FreePose => ({
  ...pose,
  yaw: pose.yaw - dx * LOOK_RAD_PER_PX,
  pitch: MathUtils.clamp(pose.pitch - dy * LOOK_RAD_PER_PX, -PITCH_LIMIT, PITCH_LIMIT),
});

/** The velocity eased towards the wish over EASE_S, at once under reduced motion; at rest below REST_SHARE. */
function easeVelocity(from: Vector3, wish: Vector3, dt: number, instant: boolean, speed: number): Vector3 {
  const velocity = from.clone().lerp(wish, instant ? 1 : 1 - Math.exp(-dt / EASE_S));
  if (wish.lengthSq() === 0 && velocity.length() < speed * REST_SHARE) velocity.set(0, 0, 0);
  return velocity;
}

/** One frame of flight: the wish from the keys, eased into the velocity, applied to the position. */
export function stepFreeCam(pose: FreePose, input: FreeInput, dt: number, speed: number): FreePose {
  const { yaw, pitch } = pose;
  const forward = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const wish = forward
    .multiplyScalar(input.forward)
    .addScaledVector(right, input.right)
    .add(new Vector3(0, input.up, 0));
  if (wish.lengthSq() > 1) wish.normalize();
  wish.multiplyScalar(speed * (input.boost ? BOOST : 1));
  const velocity = easeVelocity(pose.velocity, wish, dt, input.instant, speed);
  return { ...pose, velocity, position: pose.position.clone().addScaledVector(velocity, dt) };
}

export const walkScale = (unitRatio: number): WalkScale => ({
  eye: EYE_HEIGHT_M / unitRatio,
  step: STEP_M / unitRatio,
  fall: FALL_MPS / unitRatio,
});

export const walkSpeed = (unitRatio: number, multiplier: number) => (WALK_MPS / unitRatio) * multiplier;

export const walkClip = (unitRatio: number, flyingFar: number) => ({
  near: WALK_NEAR_M / unitRatio,
  far: Math.min(WALK_FAR_M / unitRatio, flyingFar),
});

/** Ground at (x, z) the feet may step onto: found from one step up, and no higher than it. */
function footing(w: WalkWorld, feet: number, x: number, z: number): number | null {
  const ground = w.groundAt(x, z, feet + w.scale.step);
  return ground !== null && ground - feet <= w.scale.step ? ground : null;
}

/**
 * One frame of walking: along the ground towards the yaw (the pitch only
 * looks), up a rise no taller than a step, never onto one taller or off the
 * territory's edge. Blocked, each axis is tried alone — X, then Z — so the
 * walker slides along a wall. Lower ground is reached at FALL_MPS at most.
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
  if (dx !== 0 || dz !== 0) {
    const both = footing(w, feet, x + dx, z + dz);
    const alongX = both === null ? footing(w, feet, x + dx, z) : null;
    const alongZ = both === null && alongX === null ? footing(w, feet, x, z + dz) : null;
    if (both !== null) [x, z, ground] = [x + dx, z + dz, both];
    else if (alongX !== null) [x, ground] = [x + dx, alongX];
    else if (alongZ !== null) [z, ground] = [z + dz, alongZ];
  }
  const landed = ground >= feet ? ground : Math.max(ground, feet - w.scale.fall * w.dt);
  return { ...pose, velocity, ground, position: new Vector3(x, landed + w.scale.eye, z) };
}
