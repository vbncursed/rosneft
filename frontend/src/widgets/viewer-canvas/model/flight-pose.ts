import { MathUtils, Quaternion, Spherical, Vector3 } from "three";

/**
 * Seconds: the rise over the centre (for a reader already facing it — see
 * `Flight.rise`), the pause there, the drop to 45°, one full circle.
 */
export const RISE_S = 1.2;
export const HOLD_S = 0.3;
export const DESCEND_S = 1.5;
export const REVOLUTION_S = 40;

/**
 * The flight circles this much of the fitted distance: 30 % closer, over the
 * top and round alike. The user, 2026-09-24: "при показе территории можно
 * сделать зум на 30% от начального, как сверху так и во время вращения".
 */
const FLIGHT_ZOOM = 0.7;

/** Bounds' own margin, so the circle frames the territory the way the first fit did. */
const MARGIN = 1.2;
/**
 * The top of the rise, as a polar angle from +Y: 0.6° off the pole. Straight
 * down along `camera.up`, `lookAt` has no heading and the view spins; this
 * close it reads as vertical and still faces the way the reader was looking.
 */
const TOP = 0.01;
/** 45° elevation, as a polar angle from +Y. */
const ORBIT = Math.PI / 4;
const RATE = (2 * Math.PI) / REVOLUTION_S;

export type FlightPhase = "rise" | "hold" | "descend" | "orbit";

export type Flight = {
  center: Vector3;
  distance: number;
  /** Where the camera stood, around `center`. */
  from: Spherical;
  fromTarget: Vector3;
  /**
   * The azimuth the flight stands at: behind the centre along the reader's
   * view, so looking back at the centre faces the way the reader faced.
   */
  heading: number;
  /**
   * Seconds the rise takes: `RISE_S`, stretched by the turn round to
   * `heading` — up to twice as long for a half turn. A reader facing away
   * from the centre was swung 180° in 1.2 s, which reads as a whip.
   */
  rise: number;
  /**
   * How far the circled point sits to the right of the centre, along the
   * camera's own right, so the centre lands mid-way in the canvas the Overlays
   * panel leaves visible. 0 with the panel folded; the rig eases it to follow
   * the panel while the flight runs.
   */
  offset: number;
  reduced: boolean;
};

export type FlightView = {
  fov: number;
  /** The whole canvas's. */
  aspect: number;
  /** The share of the canvas's width the open Overlays panel hides at the right; 0 or absent when folded. */
  share?: number;
};

export type FlightPose = { position: Vector3; target: Vector3; phase: FlightPhase };

/**
 * How far back the camera stands to fit a sphere in the narrower of the two
 * fields of view. `radius` must be finite and > 0; the caller guards it.
 */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const half = MathUtils.degToRad(fovDeg) / 2;
  const narrow = Math.min(half, Math.atan(Math.tan(half) * aspect));
  return (radius * MARGIN) / Math.sin(narrow);
}

/**
 * How far right of the centre to aim so the centre shows `share` of the canvas
 * left of its middle — the middle of the part left visible. The right vector is
 * perpendicular to the view, so the centre stays at `distance` deep.
 */
export function sideOffset(distance: number, { fov, aspect, share = 0 }: FlightView): number {
  return distance * Math.tan(MathUtils.degToRad(fov) / 2) * aspect * share;
}

/**
 * The share of the canvas's width from `coverLeft` (the panel's left edge) to
 * its right edge: 0 with no panel or one off the canvas, never over half.
 */
export function coveredShare(canvas: { left: number; width: number }, coverLeft: number | null): number {
  if (coverLeft === null || canvas.width <= 0) return 0;
  return MathUtils.clamp((canvas.left + canvas.width - coverLeft) / canvas.width, 0, 0.5);
}

/** Captures the start once; every frame after that is `flightPose`. */
export function planFlight(
  camera: { position: Vector3; target: Vector3 },
  sphere: { center: Vector3; radius: number },
  view: FlightView,
  reduced: boolean,
): Flight {
  const from = new Spherical().setFromVector3(camera.position.clone().sub(sphere.center));
  const look = camera.target.clone().sub(camera.position);
  const vertical = look.x === 0 && look.z === 0;
  const heading = vertical ? from.theta : Math.atan2(-look.x, -look.z);
  // Fitted to the part of the canvas the panel leaves visible.
  const distance = fitDistance(sphere.radius, view.fov, view.aspect * (1 - (view.share ?? 0))) * FLIGHT_ZOOM;
  return {
    center: sphere.center.clone(),
    distance,
    from,
    fromTarget: camera.target.clone(),
    heading,
    rise: RISE_S * (1 + Math.abs(turnOf(from.theta, heading)) / Math.PI),
    offset: sideOffset(distance, view),
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
  const { heading } = f;
  if (f.reduced) return around(f, ORBIT, heading + (RATE / 2) * t, "orbit");
  if (t < f.rise) return rise(f, MathUtils.smootherstep(t, 0, f.rise));
  if (t < f.rise + HOLD_S) return around(f, TOP, heading, "hold");
  const d = t - f.rise - HOLD_S;
  if (d < DESCEND_S) {
    const polar = MathUtils.lerp(TOP, ORBIT, MathUtils.smootherstep(d, 0, DESCEND_S));
    return around(f, polar, heading + (RATE * d * d) / (2 * DESCEND_S), "descend");
  }
  return around(f, ORBIT, heading + RATE * (d - DESCEND_S / 2), "orbit");
}

/**
 * From the start to the top. The camera eases round to `heading` the short way
 * while it climbs; the view turns from where the reader looked to the top's
 * view along one great circle. Both ends share one compass heading, so that
 * circle is vertical: the view only tilts down and never crosses the pole,
 * however the reader faced (a lerped target swung it through straight down).
 */
function rise(f: Flight, k: number): FlightPose {
  const turn = turnOf(f.from.theta, f.heading);
  const spot = new Spherical(
    MathUtils.lerp(f.from.radius, f.distance, k),
    MathUtils.lerp(f.from.phi, TOP, k),
    f.from.theta + turn * k,
  );
  // Eases aside as it climbs; the view below only turns, so the shift carries
  // the target with it and the rise lands on the hold's aim exactly.
  const position = new Vector3()
    .setFromSpherical(spot)
    .add(f.center)
    .addScaledVector(rightOf(f.heading), f.offset * k);
  const start = new Vector3().setFromSpherical(f.from).add(f.center);
  const top = new Vector3().setFromSphericalCoords(f.distance, TOP, f.heading).add(f.center);
  const lookFrom = f.fromTarget.clone().sub(start);
  const reach = MathUtils.lerp(lookFrom.length(), f.distance, k);
  const swing = new Quaternion().setFromUnitVectors(
    lookFrom.normalize(),
    f.center.clone().sub(top).normalize(),
  );
  const look = lookFrom.applyQuaternion(new Quaternion().slerp(swing, k));
  return { position, target: look.multiplyScalar(reach).add(position), phase: "rise" };
}

/** The short way round from one azimuth to another, in [-π, π). */
function turnOf(from: number, to: number): number {
  return MathUtils.euclideanModulo(to - from + Math.PI, 2 * Math.PI) - Math.PI;
}

/** The camera's right, looking in from `azimuth`: horizontal, whatever the height. */
function rightOf(azimuth: number): Vector3 {
  return new Vector3().setFromSphericalCoords(1, Math.PI / 2, azimuth + Math.PI / 2);
}

function around(f: Flight, polar: number, azimuth: number, phase: FlightPhase): FlightPose {
  const target = f.center.clone().addScaledVector(rightOf(azimuth), f.offset);
  return {
    position: new Vector3().setFromSphericalCoords(f.distance, polar, azimuth).add(target),
    target,
    phase,
  };
}

/**
 * Where the orbit pivots once a flight stops: the point of the view nearest
 * the centre, and never less than a radius ahead. Mid-rise the flight's own
 * target can sit far below the ground, and orbiting that swung the territory
 * off screen. On the view ray, so handing it over moves nothing on screen.
 */
export function landingPivot(
  position: Vector3,
  direction: Vector3,
  sphere: { center: Vector3; radius: number },
): Vector3 {
  const ahead = Math.max(sphere.center.clone().sub(position).dot(direction), sphere.radius);
  return position.clone().addScaledVector(direction, ahead);
}
