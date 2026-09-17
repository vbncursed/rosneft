import type { Vec3 } from "@/entities/placement";

/**
 * Space-grouped thousands, so a vertex count is readable at a glance.
 * A plain space, not U+2009/U+00A0: those break copy-paste of the number and
 * in-page search, and the readability gain is not worth either.
 */
export const groupDigits = (n: number) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** The bounding box as a detail line prints it: "182 / 44 / 96". */
export const formatSize = (dimensions: { x: number; y: number; z: number }) =>
  [dimensions.x, dimensions.y, dimensions.z].map((v) => Math.round(v)).join(" / ");

/** The stats strip's first span: source-unit extents to one decimal. */
export const formatDims = (d: Vec3): string =>
  `${d.x.toFixed(1)} × ${d.y.toFixed(1)} × ${d.z.toFixed(1)} m`;
