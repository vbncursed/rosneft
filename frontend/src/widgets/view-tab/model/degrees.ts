/**
 * A panorama's two angles are bearings, not rotations: 137.5° and −222.5° name
 * the same direction, and the sliders that set them run 0–360. So the
 * conversion normalises into one turn rather than passing a sign through —
 * `@/entities/placement`'s `toDegrees` is the signed rotation helper and stays
 * that way for gizmo rotation, which does need ±.
 */
export const radToDeg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360;

export const degToRad = (d: number) => (d * Math.PI) / 180;

/** The readouts: `137.5°`. One decimal — a tenth of a degree is the finest the field steps. */
export const printDegrees = (r: number) => `${radToDeg(r).toFixed(1)}°`;
