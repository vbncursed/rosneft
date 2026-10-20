import { Euler, MathUtils, Vector3, type Quaternion } from "three";

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

export type FreePose = {
  position: Vector3;
  yaw: number;
  pitch: number;
  velocity: Vector3;
  /** Walk only: the surface under the feet, in scene units. */
  ground?: number;
  /** Walk only: the speed up while off the ground, in scene units a second; absent while standing. */
  vy?: number;
};

/** Each axis is -1, 0 or 1. `instant`: prefers-reduced-motion — no easing. */
export type FreeInput = {
  forward: number;
  right: number;
  up: number;
  boost: boolean;
  /** Walk only: Space, leaves the ground. */
  jump: boolean;
  instant: boolean;
};

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"]);
/** Space: a latch, not a held key: one press per jump, only while walking (useHeldKeys). */
export const JUMP_KEY = "Space";

/** `event.code`, not `event.key`: the same physical keys on a Russian layout. */
export const isMoveKey = (code: string) => MOVE_KEYS.has(code);

export function freeInput(held: ReadonlySet<string>): Omit<FreeInput, "instant"> {
  const axis = (plus: string, minus: string) => Number(held.has(plus)) - Number(held.has(minus));
  return {
    forward: axis("KeyW", "KeyS"),
    right: axis("KeyD", "KeyA"),
    up: axis("KeyE", "KeyQ"),
    boost: held.has("ShiftLeft") || held.has("ShiftRight"),
    jump: held.has(JUMP_KEY),
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

/** The velocity eased towards the wish over `ease` seconds, at once under reduced motion; at rest below REST_SHARE. */
export function easeVelocity(
  from: Vector3,
  wish: Vector3,
  dt: number,
  instant: boolean,
  speed: number,
  ease = EASE_S,
): Vector3 {
  const velocity = from.clone().lerp(wish, instant ? 1 : 1 - Math.exp(-dt / ease));
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
