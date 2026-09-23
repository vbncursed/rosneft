import { MathUtils, Spherical, Vector3 } from "three";

/** Seconds: the rise over the centre, the pause there, the drop to 45°, one full circle. */
export const RISE_S = 1.2;
export const HOLD_S = 0.3;
export const DESCEND_S = 1.5;
export const REVOLUTION_S = 40;

/** Bounds' own margin, so the circle frames the territory the way the first fit did. */
const MARGIN = 1.2;
/**
 * The top of the rise, as a polar angle from +Y: 0.6° off the pole. Straight
 * down along `camera.up`, `lookAt` has no heading and the view spins; this
 * close it reads as vertical and keeps the reader's heading.
 */
const TOP = 0.01;
/** 45° elevation, as a polar angle from +Y. */
const ORBIT = Math.PI / 4;
const RATE = (2 * Math.PI) / REVOLUTION_S;

export type FlightPhase = "rise" | "hold" | "descend" | "orbit";

export type Flight = {
  center: Vector3;
  distance: number;
  /** Where the camera stood, around `center`; its azimuth is the heading the flight keeps. */
  from: Spherical;
  fromTarget: Vector3;
  reduced: boolean;
};

export type FlightPose = { position: Vector3; target: Vector3; phase: FlightPhase };

/** How far back the camera stands to fit a sphere in the narrower of the two fields of view. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const half = MathUtils.degToRad(fovDeg) / 2;
  const narrow = Math.min(half, Math.atan(Math.tan(half) * aspect));
  return (radius * MARGIN) / Math.sin(narrow);
}

/** Captures the start once; every frame after that is `flightPose`. */
export function planFlight(
  camera: { position: Vector3; target: Vector3 },
  sphere: { center: Vector3; radius: number },
  view: { fov: number; aspect: number },
  reduced: boolean,
): Flight {
  return {
    center: sphere.center.clone(),
    distance: fitDistance(sphere.radius, view.fov, view.aspect),
    from: new Spherical().setFromVector3(camera.position.clone().sub(sphere.center)),
    fromTarget: camera.target.clone(),
    reduced,
  };
}

/**
 * The camera `t` seconds into the flight: up over the centre, a pause, down to
 * 45°, then round. Every join is continuous in position, and the azimuth
 * speeds up through the descent (θ = ω·d²/2D) so the circle starts at its own
 * rate rather than with a jolt. Under reduced motion there is no fly-in: the
 * camera is at 45° from the first frame and circles at half speed.
 */
export function flightPose(t: number, f: Flight): FlightPose {
  const heading = f.from.theta;
  if (f.reduced) return around(f, ORBIT, heading + (RATE / 2) * t, "orbit");
  if (t < RISE_S) return rise(f, MathUtils.smootherstep(t, 0, RISE_S));
  if (t < RISE_S + HOLD_S) return around(f, TOP, heading, "hold");
  const d = t - RISE_S - HOLD_S;
  if (d < DESCEND_S) {
    const polar = MathUtils.lerp(TOP, ORBIT, MathUtils.smootherstep(d, 0, DESCEND_S));
    return around(f, polar, heading + (RATE * d * d) / (2 * DESCEND_S), "descend");
  }
  return around(f, ORBIT, heading + RATE * (d - DESCEND_S / 2), "orbit");
}

/** From the start to the top: distance, tilt and aim all ease together; the heading holds. */
function rise(f: Flight, k: number): FlightPose {
  const spot = new Spherical(
    MathUtils.lerp(f.from.radius, f.distance, k),
    MathUtils.lerp(f.from.phi, TOP, k),
    f.from.theta,
  );
  return {
    position: new Vector3().setFromSpherical(spot).add(f.center),
    target: f.fromTarget.clone().lerp(f.center, k),
    phase: "rise",
  };
}

function around(f: Flight, polar: number, azimuth: number, phase: FlightPhase): FlightPose {
  return {
    position: new Vector3().setFromSphericalCoords(f.distance, polar, azimuth).add(f.center),
    target: f.center.clone(),
    phase,
  };
}
