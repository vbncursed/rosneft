import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { FreeInput, FreePose } from "./free-cam";
import { stepWalk, walkScale, walkSpeed, type WalkWorld } from "./walk";
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

  it("takes a step up first under the body, then catches up in about 190 ms without overshoot", () => {
    const { s, seen } = stepUp(30);
    expect(seen[0]).toBeLessThan(-0.2);
    expect(seen[0]).toBeGreaterThan(-0.3);
    expect(Math.max(...seen)).toBeLessThanOrEqual(0);
    // 5 % of the step is left at ωt ≈ 4.74, 0.19 s at ω 25: 11 frames (183 ms) still above it, 12 (200 ms) under.
    expect(Math.abs(seen[10])).toBeGreaterThan(0.3 * 0.05);
    expect(Math.abs(seen[11])).toBeLessThan(0.3 * 0.05);
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
    expect(stepFeel(REST_FEEL, at(0, 2.1, 0, -1), at(0, 1.8, 0), go(), frame()).eye.x).toBe(0);
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

describe("the dip of a landing and a take-off", () => {
  /** Jump once from rest on the walker's own frames, then `n` frames; the offsets after landing. */
  const jumpAndLand = (n: number, input = go()) => {
    const w: WalkWorld = {
      dt: 1 / 60,
      speed: walkSpeed(1, 1),
      scale: walkScale(1),
      groundAt: () => 0,
      wallAt: () => false,
    };
    let p: FreePose = { ...at(0, walkScale(1).eye, 0), ground: 0 };
    let s = REST_FEEL;
    const after: number[] = [];
    for (let i = 0; i < n; i++) {
      const next = stepWalk(p, { ...input, jump: i === 0 }, w);
      s = stepFeel(s, p, next, input, frame());
      if (next.vy === undefined && i > 0) after.push(eyeOffsetM(s));
      p = next;
    }
    return { s, after };
  };
  /** `n` frames after a landing from `vy` m/s; every offset seen. */
  const landFrom = (vy: number, n = 120, input = go()) => {
    const ground = at(0, 1.8, 0);
    let s = stepFeel(REST_FEEL, at(0, 1.9, 0, vy), ground, input, frame());
    const seen = [eyeOffsetM(s)];
    for (let i = 0; i < n; i++) {
      s = stepFeel(s, ground, ground, input, frame());
      seen.push(eyeOffsetM(s));
    }
    return { s, seen };
  };

  it("lands a 0.5 m jump 6–8 cm low and swings back a little past level", () => {
    const { s, after } = jumpAndLand(200);
    expect(Math.min(...after)).toBeLessThan(-0.06);
    expect(Math.min(...after)).toBeGreaterThan(-0.08);
    expect(Math.max(...after)).toBeGreaterThan(0);
    expect(Math.max(...after)).toBeLessThan(0.01);
    expect(feelAtRest(s)).toBe(true);
    expect(eyeOffsetM(s)).toBe(0);
  });

  it("dips deeper the harder it lands, and no deeper than 25 cm", () => {
    expect(Math.min(...landFrom(-6).seen)).toBeCloseTo(-0.022 * 6, 2);
    expect(Math.min(...landFrom(-30).seen)).toBeCloseTo(-0.25, 2);
  });

  it("crouches 3.5 cm about 60 ms into a take-off, while the body already rises", () => {
    const air = at(0, 1.9, 0, 3);
    let s = stepFeel(REST_FEEL, at(0, 1.8, 0), air, go(), frame());
    const seen = [eyeOffsetM(s)];
    for (let i = 0; i < 20; i++) {
      s = stepFeel(s, air, air, go(), frame());
      seen.push(eyeOffsetM(s));
    }
    const low = Math.min(...seen);
    expect(low).toBeCloseTo(-0.035, 2);
    expect(seen.indexOf(low)).toBeGreaterThanOrEqual(2); // 2–4 frames at 60 fps: 33–67 ms
    expect(seen.indexOf(low)).toBeLessThanOrEqual(4);
  });

  it("sags the same whatever the frame: a tenth of a second in one step is six sixtieths", () => {
    const ground = at(0, 1.8, 0);
    const fall = at(0, 1.9, 0, -6);
    const slow = stepFeel(REST_FEEL, fall, ground, go(), frame({ dt: 0.1 }));
    let fast = stepFeel(REST_FEEL, fall, ground, go(), frame());
    for (let i = 0; i < 5; i++) fast = stepFeel(fast, ground, ground, go(), frame());
    expect(eyeOffsetM(slow)).toBeCloseTo(eyeOffsetM(fast), 9);
  });

  it("takes no crouch off a walker that steps off a ledge", () => {
    expect(eyeOffsetM(stepFeel(REST_FEEL, at(0, 1.8, 0), at(0, 1.79, 0, -0.16), go(), frame()))).toBe(0);
  });

  it("neither dips nor crouches under reduced motion, nor in a flight", () => {
    expect(landFrom(-6, 120, go({ instant: true })).seen.every((m) => m === 0)).toBe(true);
    expect(jumpAndLand(200, go({ instant: true })).after.every((m) => m === 0)).toBe(true);
    const flight = stepFeel(REST_FEEL, at(0, 1.9, 0, -6), at(0, 1.8, 0), go(), frame({ walking: false }));
    expect(eyeOffsetM(flight)).toBe(0);
  });
});

describe("the bob of a step and the run's wider view", () => {
  /** `n` frames north at `mps` over level ground, from `feel`; the feel and every offset. Airborne: both poses in the air. */
  const stroll = (feel: Feel, mps: number, n: number, input = go({ forward: 1 }), f = frame(), airborne = false) => {
    let s = feel;
    const seen: number[] = [];
    const vy = airborne ? 0.5 : undefined;
    for (let i = 0; i < n; i++) {
      const z = (i * mps * f.dt) / f.unitRatio;
      const step = (mps * f.dt) / f.unitRatio;
      s = stepFeel(s, at(0, 1.8 / f.unitRatio, -z, vy), at(0, 1.8 / f.unitRatio, -z - step, vy), input, f);
      seen.push(eyeOffsetM(s));
    }
    return { s, seen };
  };
  const depth = (seen: number[]) => Math.max(...seen) - Math.min(...seen);

  it("bobs 1.5 cm walking and 2.5 cm running, never over the eye's height", () => {
    const walk = stroll(stroll(REST_FEEL, 1.4, 60).s, 1.4, 120).seen;
    expect(depth(walk)).toBeCloseTo(0.015, 3);
    expect(Math.max(...walk)).toBeLessThanOrEqual(0);
    expect(depth(stroll(stroll(REST_FEEL, 4, 60).s, 4, 120, go({ forward: 1, boost: true })).seen)).toBeCloseTo(
      0.025,
      3,
    );
  });

  it("bobs the same metres whatever the scene's unit", () => {
    const tenth = stroll(
      stroll(REST_FEEL, 1.4, 60, go({ forward: 1 }), frame({ unitRatio: 10 })).s,
      1.4,
      120,
      go({ forward: 1 }),
      frame({ unitRatio: 10 }),
    );
    expect(depth(tenth.seen)).toBeCloseTo(0.015, 3);
  });

  it("gives the same bob and wider view at a tenth of a second a frame as at a sixtieth", () => {
    const slow = stroll(REST_FEEL, 4, 10, go({ forward: 1, boost: true }), frame({ dt: 0.1 })).s;
    const fast = stroll(REST_FEEL, 4, 60, go({ forward: 1, boost: true }), frame()).s;
    expect(fovKickDeg(slow)).toBeCloseTo(fovKickDeg(fast), 6);
    expect(slow.bob.x).toBeCloseTo(fast.bob.x, 6);
  });

  it("fades out in the air, and once the walker stops, to exactly level", () => {
    const walking = stroll(REST_FEEL, 1.4, 60).s;
    expect(Math.abs(stroll(walking, 1.4, 60, go({ forward: 1 }), frame(), true).seen.at(-1)!)).toBeLessThan(1e-3);
    const stopped = hold(walking, at(0, 1.8, 0), 120);
    expect(eyeOffsetM(stopped)).toBe(0);
    expect(feelAtRest(stopped)).toBe(true);
  });

  it("does not bob a walker held against a wall, nor under reduced motion, nor in a flight", () => {
    expect(hold(REST_FEEL, at(0, 1.8, 0), 120, go({ forward: 1 })).bob.x).toBe(0);
    expect(stroll(REST_FEEL, 1.4, 120, go({ forward: 1, instant: true })).seen.every((m) => m === 0)).toBe(true);
    expect(stroll(REST_FEEL, 1.4, 120, go({ forward: 1 }), frame({ walking: false })).seen.every((m) => m === 0)).toBe(
      true,
    );
  });

  it("widens the view 3° at a run and brings it home once Shift is up, to exactly none", () => {
    const running = stroll(REST_FEEL, 4, 60, go({ forward: 1, boost: true })).s;
    expect(fovKickDeg(running)).toBeCloseTo(3, 2);
    const kept = stroll(running, 4, 30, go({ forward: 1, boost: true }), frame(), true).s;
    expect(fovKickDeg(kept)).toBeCloseTo(3, 2); // in the air it holds: nothing new on a jump
    const home = stroll(running, 1.4, 120).s;
    expect(fovKickDeg(home)).toBe(0);
  });

  it("starts the bob at a slow walk at any frame rate: 0.3 m/s at 360 Hz settles at 3.2 mm", () => {
    const s = stroll(REST_FEEL, 0.3, 360, go({ forward: 1 }), frame({ dt: 1 / 360 })).s;
    expect(s.bob.x).toBeGreaterThan(0);
    expect(s.bob.x).toBeCloseTo(0.0032, 3);
  });

  it("still snaps a stopped bob to exactly level at a high frame rate", () => {
    const f = frame({ dt: 1 / 360 });
    const walking = stroll(REST_FEEL, 0.3, 360, go({ forward: 1 }), f).s;
    expect(feelAtRest(hold(walking, at(0, 1.8, 0), 360, go(), f))).toBe(true);
  });

  it("holds the view in a flight begun from a standstill, however Shift is held", () => {
    const takeOff = stepFeel(REST_FEEL, at(0, 1.8, 0), at(0, 1.9, 0, 3), go({ jump: true }), frame());
    const flown = stroll(takeOff, 4, 60, go({ forward: 1, boost: true }), frame(), true).s;
    expect(fovKickDeg(flown)).toBeLessThanOrEqual(fovKickDeg(takeOff));
  });

  it("does not widen the view standing with Shift held, jumping, in a flight, or under reduced motion", () => {
    expect(fovKickDeg(hold(REST_FEEL, at(0, 1.8, 0), 60, go({ boost: true })))).toBe(0);
    expect(fovKickDeg(stepFeel(REST_FEEL, at(0, 1.8, 0), at(0, 1.9, 0, 3), go({ jump: true }), frame()))).toBe(0);
    expect(fovKickDeg(stroll(REST_FEEL, 4, 60, go({ forward: 1, boost: true }), frame({ walking: false })).s)).toBe(0);
    expect(fovKickDeg(stroll(REST_FEEL, 4, 60, go({ forward: 1, boost: true, instant: true })).s)).toBe(0);
  });
});
