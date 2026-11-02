import type { Vec3 } from "@/entities/placement";

/** Where a batch starts and which way its row runs: a zone's centre and axis. */
export type PlacementOrigin = { position: Vec3; yaw: number };

export const sameOrigin = (a: PlacementOrigin | null, b: PlacementOrigin | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.yaw === b.yaw &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.position.z === b.position.z);

/**
 * Where copy `i` of a row goes. From an origin the row starts there and runs
 * along its axis (rotating (a, 0, 0) about Y by yaw gives (a cos, 0, -a sin));
 * without one the copies lie along +x from the scene's origin.
 */
export function rowPosition(i: number, step: number, origin: PlacementOrigin | null): Vec3 {
  if (!origin) return { x: i * step, y: 0, z: 0 };
  return {
    x: origin.position.x + i * step * Math.cos(origin.yaw),
    y: origin.position.y,
    z: origin.position.z - i * step * Math.sin(origin.yaw),
  };
}
