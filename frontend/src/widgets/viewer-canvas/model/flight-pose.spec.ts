import { MathUtils, Spherical, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  type FlightPose,
  DESCEND_S,
  HOLD_S,
  REVOLUTION_S,
  RISE_S,
  fitDistance,
  flightPose,
  planFlight,
} from "./flight-pose";

const CENTER = new Vector3(1, 2, 3);
const DISTANCE = fitDistance(2, 50, 1.5);

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

const TOP_AT = RISE_S;
const DOWN_AT = RISE_S + HOLD_S;
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

  it("rises over the centre at the fitted distance, facing the way the reader faced", () => {
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
    for (let t = frame; t < DOWN_AT; t += frame) {
      const now = flightPose(t, outward);
      const turn = Math.abs(MathUtils.euclideanModulo(yaw(now) - yaw(before) + Math.PI, 2 * Math.PI) - Math.PI);
      expect(turn).toBeLessThan(MathUtils.degToRad(1));
      if (t < RISE_S) expect(offDown(now)).toBeGreaterThan(0.0099);
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
