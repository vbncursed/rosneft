export type Axis = "x" | "y" | "z";
export type Vec3 = Record<Axis, number>;

export const AXES: Axis[] = ["x", "y", "z"];

/**
 * Parses one axis box. Returns null for anything not yet a number — "-", "1."
 * and "" are all legal things to have typed halfway through, and reporting
 * them as 0 is what makes a numeric field fight the person using it.
 */
export function parseAxis(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || !/^-?\d*\.?\d*$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
