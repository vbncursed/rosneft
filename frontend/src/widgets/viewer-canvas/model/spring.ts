/** A damped spring: how far it is off its rest, and how fast it moves, in one unit. */
export type Spring = { x: number; v: number };

export const AT_REST: Spring = { x: 0, v: 0 };

/**
 * The spring `dt` seconds on, pulled towards `target`: ω the stiffness (rad/s),
 * ζ the damping — 1 comes home without overshoot, under 1 swings a little past.
 * A closed form, not a step of Euler: one long frame lands where many short ones
 * do, so a lost frame neither shakes it nor changes where it goes.
 */
export function springTo(s: Spring, target: number, omega: number, zeta: number, dt: number): Spring {
  if (!(dt > 0)) return s;
  const x0 = s.x - target;
  const v0 = s.v;
  if (zeta >= 1) {
    const e = Math.exp(-omega * dt);
    const c = v0 + omega * x0;
    return { x: target + (x0 + c * dt) * e, v: (v0 - omega * c * dt) * e };
  }
  const a = zeta * omega;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-a * dt);
  const cos = Math.cos(wd * dt);
  const sin = Math.sin(wd * dt);
  const b = (v0 + a * x0) / wd;
  return { x: target + e * (x0 * cos + b * sin), v: e * (v0 * cos - (x0 * wd + a * b) * sin) };
}

/** The speed that, given to a spring at rest, carries it `depth` (signed) out before it turns back. */
export function kickFor(depth: number, omega: number, zeta: number): number {
  if (zeta >= 1) return depth * omega * Math.E;
  const a = zeta * omega;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const turn = Math.atan2(wd, a) / wd;
  return (depth * wd) / (Math.exp(-a * turn) * Math.sin(wd * turn));
}
