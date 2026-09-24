import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  type FlightPose,
  DESCEND_S,
  HOLD_S,
  REVOLUTION_S,
  RISE_S,
  coveredShare,
  fitDistance,
  flightPose,
  landingPivot,
  planFlight,
  sideOffset,
} from "./flight-pose";

const CENTER = new Vector3(1, 2, 3);
/** The flight flies 30 % closer than the fit (user request 2026-09-24). */
const DISTANCE = 0.7 * fitDistance(2, 50, 1.5);

// The camera stands 5 east of the centre, level with it, looking at the origin.
const plan = (reduced = false) =>
  planFlight(
    { position: new Vector3(6, 2, 3), target: new Vector3(0, 0, 0) },
    { center: CENTER, radius: 2 },
    { fov: 50, aspect: 1.5 },
    reduced,
  );

/** Where the camera is at `t`, relative to the centre it circles. */
const offset = (t: number, reduced = false) =>
  flightPose(t, plan(reduced)).position.clone().sub(CENTER);
/** cos of the angle from straight up: 1 overhead, √½ at 45°. */
const upness = (v: Vector3) => v.y / v.length();
const azimuth = (v: Vector3) => new Spherical().setFromVector3(v).theta;
const look = (p: FlightPose) => p.target.clone().sub(p.position);
/** The compass heading of the view, the way Spherical measures azimuth. */
const yaw = (p: FlightPose) => Math.atan2(look(p).x, look(p).z);
/** The angle between the view and straight down. */
const offDown = (p: FlightPose) => Math.acos(-look(p).y / look(p).length());
/** The reader in `plan` looks from (6, 2, 3) at the origin. */
const READER_YAW = Math.atan2(-6, -3);

/** The reader in `plan` turns 27° on the way up, which lengthens the rise a little. */
const TOP_AT = plan().rise;
const DOWN_AT = TOP_AT + HOLD_S;
const ORBIT_AT = DOWN_AT + DESCEND_S;
const RATE = (2 * Math.PI) / REVOLUTION_S;

describe("fitDistance", () => {
  it("backs off until the sphere, with Bounds' 1.2 margin, fits the field of view", () => {
    expect(fitDistance(1, 90, 1)).toBeCloseTo(1.2 / Math.sin(Math.PI / 4), 9);
  });

  it("fits the narrower field: a portrait viewport stands further back, a wide one does not", () => {
    expect(fitDistance(1, 90, 0.5)).toBeCloseTo(1.2 / Math.sin(Math.atan(0.5)), 9);
    expect(fitDistance(1, 90, 2)).toBeCloseTo(fitDistance(1, 90, 1), 9);
  });
});

describe("flightPose", () => {
  it("leaves from exactly where the camera stood, looking where it looked", () => {
    const pose = flightPose(0, plan());
    expect(pose.phase).toBe("rise");
    expect(pose.position.distanceTo(new Vector3(6, 2, 3))).toBeLessThan(1e-9);
    expect(pose.target.distanceTo(new Vector3(0, 0, 0))).toBeLessThan(1e-9);
  });

  it("rises over the centre 30 % inside the fitted distance, facing the way the reader faced", () => {
    const top = flightPose(TOP_AT, plan());
    const v = offset(TOP_AT);
    expect(top.phase).toBe("hold");
    expect(top.target.distanceTo(CENTER)).toBeLessThan(1e-9);
    expect(v.length()).toBeCloseTo(DISTANCE, 9);
    expect(upness(v)).toBeGreaterThan(0.9999);
    // Never the pole itself: lookAt straight down along `up` has no heading.
    expect(upness(v)).toBeLessThan(1);
    expect(yaw(top)).toBeCloseTo(READER_YAW, 9);
  });

  it("holds still over the centre for the pause", () => {
    expect(flightPose(DOWN_AT - 1e-3, plan()).phase).toBe("hold");
    expect(offset(DOWN_AT - 1e-3).distanceTo(offset(TOP_AT))).toBeLessThan(1e-9);
  });

  it("drops to 45° at the same distance by the end of the descent", () => {
    expect(flightPose(ORBIT_AT - 1e-3, plan()).phase).toBe("descend");
    expect(flightPose(ORBIT_AT, plan()).phase).toBe("orbit");
    const v = offset(ORBIT_AT);
    expect(upness(v)).toBeCloseTo(Math.SQRT1_2, 9);
    expect(v.length()).toBeCloseTo(DISTANCE, 9);
  });

  it.each([
    ["rise → hold", TOP_AT],
    ["hold → descend", DOWN_AT],
    ["descend → orbit", ORBIT_AT],
  ])("joins %s without a jump", (_, at) => {
    const before = flightPose(at - 1e-7, plan());
    const after = flightPose(at, plan());
    expect(before.position.distanceTo(after.position)).toBeLessThan(1e-5);
    expect(before.target.distanceTo(after.target)).toBeLessThan(1e-5);
  });

  it("carries its turn into the orbit at the orbit's own rate, so the circle starts without a kick", () => {
    const h = 1e-4;
    const into = (azimuth(offset(ORBIT_AT)) - azimuth(offset(ORBIT_AT - h))) / h;
    const onward = (azimuth(offset(ORBIT_AT + h)) - azimuth(offset(ORBIT_AT))) / h;
    expect(into).toBeCloseTo(RATE, 3);
    expect(onward).toBeCloseTo(RATE, 3);
  });

  it("circles once every REVOLUTION_S seconds, at one height", () => {
    const now = offset(ORBIT_AT + 3);
    expect(offset(ORBIT_AT + 3 + REVOLUTION_S).distanceTo(now)).toBeLessThan(1e-9);
    expect(offset(ORBIT_AT + 3 + REVOLUTION_S / 2).y).toBeCloseTo(now.y, 9);
  });

  it("under reduced motion skips the fly-in and circles at half speed", () => {
    const pose = flightPose(0, plan(true));
    const v = offset(0, true);
    expect(pose.phase).toBe("orbit");
    expect(pose.target.distanceTo(CENTER)).toBeLessThan(1e-9);
    expect(upness(v)).toBeCloseTo(Math.SQRT1_2, 9);
    expect(v.length()).toBeCloseTo(DISTANCE, 9);
    expect(yaw(pose)).toBeCloseTo(READER_YAW, 9);
    // Half a turn after one normal revolution, home after two.
    expect(offset(REVOLUTION_S, true).distanceTo(v)).toBeGreaterThan(1);
    expect(offset(2 * REVOLUTION_S, true).distanceTo(v)).toBeLessThan(1e-9);
  });

  it("never whips through the zenith when the reader faces away from the centre", () => {
    // Near overhead, looking outward: the old path turned the view 110° in 0.15 s.
    const outward = planFlight(
      { position: new Vector3(1, 6, 0.3), target: new Vector3(6, 0, 0) },
      { center: new Vector3(0, 0, 0), radius: 5 },
      { fov: 50, aspect: 1.5 },
      false,
    );
    const frame = 1 / 120;
    let before = flightPose(0, outward);
    for (let t = frame; t < outward.rise + HOLD_S; t += frame) {
      const now = flightPose(t, outward);
      const turn = Math.abs(MathUtils.euclideanModulo(yaw(now) - yaw(before) + Math.PI, 2 * Math.PI) - Math.PI);
      expect(turn).toBeLessThan(MathUtils.degToRad(1));
      if (t < outward.rise) expect(offDown(now)).toBeGreaterThan(0.0099);
      before = now;
    }
    expect(yaw(before)).toBeCloseTo(Math.atan2(5, -0.3), 9);
  });

  it("keeps the camera's own side when the reader looks straight down and has no heading", () => {
    const down = planFlight(
      { position: new Vector3(6, 2, 3), target: new Vector3(6, -5, 3) },
      { center: CENTER, radius: 2 },
      { fov: 50, aspect: 1.5 },
      false,
    );
    expect(azimuth(flightPose(TOP_AT, down).position.clone().sub(CENTER))).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe("planFlight's rise", () => {
  const facing = (target: Vector3) =>
    planFlight({ position: new Vector3(6, 2, 3), target }, { center: CENTER, radius: 2 }, { fov: 50, aspect: 1.5 }, false);

  it("takes the base time when the reader already faces the centre", () => {
    expect(facing(CENTER.clone()).rise).toBeCloseTo(RISE_S, 9);
  });

  it("takes twice as long for a half turn, so a reader facing away is not whipped round", () => {
    const away = facing(new Vector3(12, 2, 3));
    expect(away.rise).toBeCloseTo(2 * RISE_S, 9);
    expect(flightPose(1.5 * RISE_S, away).phase).toBe("rise");
    expect(flightPose(2 * RISE_S, away).phase).toBe("hold");
  });
});

// E7: the open Overlays panel hides the canvas's right quarter or so; the
// flight centres the territory in what is left, not under the panel.
describe("flightPose beside the Overlays panel", () => {
  // Enough to make the visible part narrower than tall, so the fit changes.
  const SHARE = 0.4;
  const beside = (share = SHARE, reduced = false) =>
    planFlight(
      { position: new Vector3(6, 2, 3), target: new Vector3(0, 0, 0) },
      { center: CENTER, radius: 2 },
      { fov: 50, aspect: 1.5, share },
      reduced,
    );
  /** Where the centre lands across the whole canvas, in NDC: -1 left edge, 1 right. */
  const ndcX = (pose: FlightPose) => {
    const cam = new PerspectiveCamera(50, 1.5);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld();
    return CENTER.clone().project(cam).x;
  };
  const TIMES = [0, TOP_AT / 2, TOP_AT, DOWN_AT + 0.7, ORBIT_AT, ORBIT_AT + 9];

  it("changes nothing while the panel is folded", () => {
    for (const t of TIMES) {
      const a = flightPose(t, plan());
      const b = flightPose(t, beside(0));
      expect(b.position.distanceTo(a.position)).toBeLessThan(1e-9);
      expect(b.target.distanceTo(a.target)).toBeLessThan(1e-9);
    }
  });

  it("centres the territory in the part of the canvas the panel leaves", () => {
    // The visible part spans NDC -1 … 1 - 2·share; its middle is -share.
    for (const t of [TOP_AT, DOWN_AT + 0.7, ORBIT_AT, ORBIT_AT + 9]) {
      expect(ndcX(flightPose(t, beside()))).toBeCloseTo(-SHARE, 9);
    }
  });

  it("fits the circle to the visible width, not the canvas's", () => {
    const pose = flightPose(ORBIT_AT + 3, beside());
    const distance = 0.7 * fitDistance(2, 50, 1.5 * (1 - SHARE));
    expect(pose.position.distanceTo(pose.target)).toBeCloseTo(distance, 9);
  });

  it("leaves from where the camera stood and eases aside over the rise, without a jump into the hold", () => {
    const start = flightPose(0, beside());
    expect(start.position.distanceTo(new Vector3(6, 2, 3))).toBeLessThan(1e-9);
    expect(start.target.distanceTo(new Vector3(0, 0, 0))).toBeLessThan(1e-9);
    const before = flightPose(TOP_AT - 1e-6, beside());
    const after = flightPose(TOP_AT, beside());
    expect(before.position.distanceTo(after.position)).toBeLessThan(1e-4);
    expect(before.target.distanceTo(after.target)).toBeLessThan(1e-4);
  });

  it("stands beside the panel from the first frame under reduced motion", () => {
    expect(ndcX(flightPose(0, beside(SHARE, true)))).toBeCloseTo(-SHARE, 9);
  });

  it("moves the target by the share of the half-width at the flight's distance", () => {
    const half = Math.tan(MathUtils.degToRad(25)) * 1.5;
    expect(sideOffset(10, { fov: 50, aspect: 1.5, share: SHARE })).toBeCloseTo(10 * half * SHARE, 9);
    expect(sideOffset(10, { fov: 50, aspect: 1.5 })).toBe(0);
  });
});

describe("coveredShare", () => {
  const CANVAS = { left: 0, width: 1280 };

  it("is the part of the canvas's width from the panel's left edge on", () => {
    expect(coveredShare(CANVAS, 946)).toBeCloseTo(334 / 1280, 9);
  });

  it("is nothing with no panel, or one off the canvas", () => {
    expect(coveredShare(CANVAS, null)).toBe(0);
    expect(coveredShare(CANVAS, 1400)).toBe(0);
    expect(coveredShare({ left: 0, width: 0 }, 10)).toBe(0);
  });

  it("never hides more than half the canvas", () => {
    expect(coveredShare(CANVAS, 100)).toBe(0.5);
  });
});

describe("landingPivot", () => {
  const SPHERE = { center: CENTER, radius: 2 };

  it("pivots on the point of the view nearest the centre", () => {
    // From 10 above the centre's level, looking level along -z past it.
    const pivot = landingPivot(new Vector3(1, 12, 10), new Vector3(0, 0, -1), SPHERE);
    expect(pivot.toArray()).toEqual([1, 12, 3]);
  });

  it("stays a radius ahead when the view points away from the centre", () => {
    const pivot = landingPivot(new Vector3(1, 2, 10), new Vector3(0, 0, 1), SPHERE);
    expect(pivot.toArray()).toEqual([1, 2, 12]);
  });
});
