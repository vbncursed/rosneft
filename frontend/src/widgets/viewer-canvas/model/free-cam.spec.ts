import { Quaternion, Euler, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  CLICK_SLOP_PX,
  clipPlanes,
  freeInput,
  freeSpeed,
  isMoveKey,
  lookStep,
  nextMultiplier,
  poseOf,
  stepFreeCam,
  type FreeInput,
  type FreePose,
} from "./free-cam";

const at = (yaw = 0, pitch = 0): FreePose => ({ position: new Vector3(), yaw, pitch, velocity: new Vector3() });
const go = (over: Partial<FreeInput>): FreeInput => ({
  forward: 0,
  right: 0,
  up: 0,
  boost: false,
  instant: true,
  ...over,
});

describe("stepFreeCam", () => {
  it("flies along the view: W is -Z at yaw 0, D is +X, E is world up", () => {
    expect(stepFreeCam(at(), go({ forward: 1 }), 1, 2).position.toArray()).toEqual(
      [0, 0, -2].map((v) => expect.closeTo(v)),
    );
    expect(stepFreeCam(at(), go({ right: 1 }), 1, 2).position.x).toBeCloseTo(2);
    expect(stepFreeCam(at(0, -1), go({ up: 1 }), 1, 2).position.toArray()).toEqual(
      [0, 2, 0].map((v) => expect.closeTo(v)),
    );
  });
  it("climbs with the view when it looks up — forward follows the pitch", () => {
    expect(stepFreeCam(at(0, Math.PI / 4), go({ forward: 1 }), 1, 1).position.y).toBeCloseTo(Math.SQRT1_2);
  });
  it("turns with the yaw: facing -X after a quarter turn left", () => {
    expect(stepFreeCam(at(Math.PI / 2), go({ forward: 1 }), 1, 1).position.x).toBeCloseTo(-1);
  });
  it("does not fly faster on a diagonal", () => {
    expect(stepFreeCam(at(), go({ forward: 1, right: 1, up: 1 }), 1, 1).position.length()).toBeCloseTo(1);
  });
  it("Shift multiplies the speed by four", () => {
    expect(stepFreeCam(at(), go({ forward: 1, boost: true }), 1, 1).position.z).toBeCloseTo(-4);
  });
  it("eases in and out over 0.12 s, and stops dead once released", () => {
    const first = stepFreeCam(at(), go({ forward: 1, instant: false }), 0.016, 1);
    expect(first.velocity.length()).toBeGreaterThan(0);
    expect(first.velocity.length()).toBeLessThan(1);
    let p = first;
    for (let i = 0; i < 60; i++) p = stepFreeCam(p, go({ instant: false }), 0.05, 1);
    expect(p.velocity.lengthSq()).toBe(0);
  });
  it("moves and stops at once under reduced motion", () => {
    const moving = stepFreeCam(at(), go({ forward: 1 }), 0.016, 1);
    expect(moving.velocity.length()).toBeCloseTo(1);
    expect(stepFreeCam(moving, go({}), 0.016, 1).velocity.lengthSq()).toBe(0);
  });
});

describe("lookStep", () => {
  it("turns right on a drag right and looks down on a drag down", () => {
    const p = lookStep(at(), 100, 50);
    expect(p.yaw).toBeCloseTo(-0.4);
    expect(p.pitch).toBeCloseTo(-0.2);
  });
  it("never tips over the pole", () => {
    expect(lookStep(at(), 0, -100_000).pitch).toBeLessThan(Math.PI / 2);
    expect(lookStep(at(), 0, 100_000).pitch).toBeGreaterThan(-Math.PI / 2);
  });
});

describe("poseOf", () => {
  it("reads yaw and pitch off a roll-free camera and starts at rest", () => {
    const q = new Quaternion().setFromEuler(new Euler(-0.3, 1.1, 0, "YXZ"));
    const p = poseOf(new Vector3(1, 2, 3), q);
    expect(p.yaw).toBeCloseTo(1.1);
    expect(p.pitch).toBeCloseTo(-0.3);
    expect(p.velocity.lengthSq()).toBe(0);
  });
});

describe("speed, keys and clip planes", () => {
  it("flies 0.4 territory radii a second, scaled by the wheel", () => {
    expect(freeSpeed(2, 1)).toBeCloseTo(0.8);
    expect(freeSpeed(2, 10)).toBeCloseTo(8);
  });
  it("keeps the wheel multiplier within 0.1–10, faster on a wheel up", () => {
    expect(nextMultiplier(1, -100)).toBeGreaterThan(1);
    expect(nextMultiplier(1, 100)).toBeLessThan(1);
    expect(nextMultiplier(1, -1e6)).toBe(10);
    expect(nextMultiplier(1, 1e6)).toBe(0.1);
  });
  it("maps the held codes onto axes, layout-independent", () => {
    expect(freeInput(new Set(["KeyW", "KeyD", "KeyE", "ShiftLeft"]))).toEqual({
      forward: 1,
      right: 1,
      up: 1,
      boost: true,
    });
    expect(freeInput(new Set(["KeyW", "KeyS", "KeyA", "KeyQ"]))).toEqual({
      forward: 0,
      right: -1,
      up: -1,
      boost: false,
    });
    expect(isMoveKey("KeyW")).toBe(true);
    expect(isMoveKey("KeyF")).toBe(false);
  });
  it("keeps the depth range Bounds itself uses (far/near = 10 000)", () => {
    const { near, far } = clipPlanes(1.7);
    expect(far / near).toBeCloseTo(10_000);
    expect(near).toBeLessThan(0.01);
  });
  it("treats under four pixels as a click", () => {
    expect(CLICK_SLOP_PX).toBe(4);
  });
});
