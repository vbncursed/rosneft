import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { FreeInput, FreePose } from "./free-cam";
import {
  eyeOffsetM,
  feelAtRest,
  fovHome,
  fovKickDeg,
  REST_FEEL,
  stepFeel,
  type Feel,
  type FeelFrame,
} from "./walk-feel";

const go = (over: Partial<FreeInput> = {}): FreeInput => ({
  forward: 0,
  right: 0,
  up: 0,
  boost: false,
  jump: false,
  instant: false,
  ...over,
});
/** A pose at (x, y, z), in the air when `vy` is given. */
const at = (x: number, y: number, z: number, vy?: number): FreePose => ({
  position: new Vector3(x, y, z),
  yaw: 0,
  pitch: 0,
  velocity: new Vector3(),
  ...(vy === undefined ? {} : { vy }),
});
const frame = (over: Partial<FeelFrame> = {}): FeelFrame => ({ dt: 1 / 60, unitRatio: 1, walking: true, ...over });
/** `n` frames standing still at `p`. */
const hold = (feel: Feel, p: FreePose, n: number, input = go(), f = frame()) => {
  let s = feel;
  for (let i = 0; i < n; i++) s = stepFeel(s, p, p, input, f);
  return s;
};
/** A 0.3 m step up, taken in one frame, then `n` frames standing on it; every offset seen. */
const stepUp = (n: number, input = go(), f = frame()) => {
  const low = at(0, 1.8 / f.unitRatio, 0);
  const high = at(0, 2.1 / f.unitRatio, 0);
  let s = stepFeel(REST_FEEL, low, high, input, f);
  const seen = [eyeOffsetM(s)];
  for (let i = 0; i < n; i++) {
    s = stepFeel(s, high, high, input, f);
    seen.push(eyeOffsetM(s));
  }
  return { s, seen };
};

describe("the eye over a walking body", () => {
  it("moves nothing while the body stands still", () => {
    const s = hold(REST_FEEL, at(0, 1.8, 0), 10);
    expect(eyeOffsetM(s)).toBe(0);
    expect(feelAtRest(s)).toBe(true);
  });

  it("takes a step up first under the body, then catches up in about 120 ms without overshoot", () => {
    const { s, seen } = stepUp(30);
    expect(seen[0]).toBeLessThan(-0.2);
    expect(seen[0]).toBeGreaterThan(-0.3);
    expect(Math.max(...seen)).toBeLessThanOrEqual(0);
    expect(Math.abs(seen[6])).toBeLessThan(0.3 * 0.06); // 7 frames: 117 ms
    expect(eyeOffsetM(s)).toBe(0);
    expect(feelAtRest(s)).toBe(true);
  });

  it("takes a step down from above, likewise", () => {
    const s = stepFeel(REST_FEEL, at(0, 2.1, 0), at(0, 1.8, 0), go(), frame());
    expect(eyeOffsetM(s)).toBeGreaterThan(0.2);
  });

  it("measures the step in metres, whatever the scene's unit", () => {
    expect(stepUp(3, go(), frame({ unitRatio: 10 })).seen).toEqual(stepUp(3).seen.map((m) => expect.closeTo(m, 9)));
  });

  it("takes nothing off a landing or a flight: only a snap on the ground is smoothed", () => {
    expect(eyeOffsetM(stepFeel(REST_FEEL, at(0, 2.1, 0, -1), at(0, 1.8, 0), go(), frame()))).toBe(0);
    expect(eyeOffsetM(stepFeel(REST_FEEL, at(0, 1.8, 0), at(0, 2.1, 0), go(), frame({ walking: false })))).toBe(0);
  });

  it("under reduced motion the catch-up is the same spring, not a gentler one", () => {
    expect(stepUp(30, go({ instant: true })).seen).toEqual(stepUp(30).seen);
  });

  it("starts a walk begun or ended level with the pose, the view's kick still easing home", () => {
    const busy: Feel = { ...REST_FEEL, walking: true, eye: { x: -0.2, v: 1 }, fov: { x: 3, v: 0 } };
    const out = stepFeel(busy, at(0, 1.8, 0), at(0, 1.8, 0), go(), frame({ walking: false }));
    expect(eyeOffsetM(out)).toBe(0);
    expect(out.walking).toBe(false);
    expect(fovKickDeg(out)).toBeGreaterThan(0);
    expect(fovKickDeg(out)).toBeLessThan(3);
  });

  it("moves nothing on a frame that is not a number", () => {
    const busy: Feel = { ...REST_FEEL, walking: true, eye: { x: -0.2, v: 0 } };
    expect(stepFeel(busy, at(0, 1.8, 0), at(0, 1.8, 0), go(), frame({ dt: Number.NaN }))).toBe(busy);
  });
});

describe("fovHome", () => {
  it("brings the view's kick home without overshoot, to exactly none", () => {
    let s = { x: 3, v: 0 };
    let last = 3;
    for (let i = 0; i < 20; i++) {
      s = fovHome(s, 0.1);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(last);
      last = s.x;
    }
    expect(s).toEqual({ x: 0, v: 0 });
  });
});
