import type { Pt } from "./geometry";

export interface Similarity {
  scale: number;
  rotation: number;
  tx: number;
  tz: number;
}

export type FitResult =
  | { ok: true; fit: Similarity; residuals: number[]; exact: boolean }
  | { ok: false; reason: "too-few" | "degenerate" | "mirrored"; message: string };

type FitPair = { pdf: Pt; scene: { x: number; z: number } };

const MIN_SPREAD_PT2 = 1; // sum of squared distances from the centroid
const COLLINEAR_RATIO = 1e-4; // smaller covariance eigenvalue over the larger
const EXACT = 1e-9;

const fail = (reason: "too-few" | "degenerate" | "mirrored", message: string): FitResult => ({
  ok: false,
  reason,
  message,
});
const DEGENERATE = "Pick points farther apart on the plan.";
const MIRRORED =
  "These points are mirrored relative to the model. Check that each point on the plan is matched to the same spot on the model; the model expects x east and z south.";

export function applyFit(fit: Similarity, p: Pt): { x: number; z: number } {
  const [c, s] = [Math.cos(fit.rotation) * fit.scale, Math.sin(fit.rotation) * fit.scale];
  return { x: c * p.x - s * p.y + fit.tx, z: s * p.x + c * p.y + fit.tz };
}

// fitSimilarity is a 2D Umeyama fit from PDF (x, y down) to scene (x, z), with
// no reflection allowed. Two pairs fit exactly.
export function fitSimilarity(pairs: FitPair[]): FitResult {
  const n = pairs.length;
  if (n < 2) return fail("too-few", "Add at least two point pairs.");
  const ca = { x: pairs.reduce((s, p) => s + p.pdf.x, 0) / n, y: pairs.reduce((s, p) => s + p.pdf.y, 0) / n };
  const cb = { x: pairs.reduce((s, p) => s + p.scene.x, 0) / n, z: pairs.reduce((s, p) => s + p.scene.z, 0) / n };

  // H = sum b a^T over the centred sets, and the covariance of a.
  let [h00, h01, h10, h11, saa, sxx, sxy, syy] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pairs) {
    const [ax, ay, bx, bz] = [p.pdf.x - ca.x, p.pdf.y - ca.y, p.scene.x - cb.x, p.scene.z - cb.z];
    [h00, h01, h10, h11] = [h00 + bx * ax, h01 + bx * ay, h10 + bz * ax, h11 + bz * ay];
    [saa, sxx, sxy, syy] = [saa + ax * ax + ay * ay, sxx + ax * ax, sxy + ax * ay, syy + ay * ay];
  }
  const root = Math.hypot(sxx - syy, 2 * sxy);
  const [big, small] = [(sxx + syy + root) / 2, (sxx + syy - root) / 2];
  if (saa < MIN_SPREAD_PT2 || (n > 2 && small < COLLINEAR_RATIO * big)) return fail("degenerate", DEGENERATE);

  const [cos, sin] = [h00 + h11, h10 - h01];
  const scale = Math.hypot(cos, sin) / saa;
  if (scale === 0) return fail("degenerate", DEGENERATE);
  if (n > 2 && h00 * h11 - h01 * h10 < 0) return fail("mirrored", MIRRORED);

  const rotation = Math.atan2(sin, cos);
  const [c, s] = [Math.cos(rotation) * scale, Math.sin(rotation) * scale];
  const fit: Similarity = { scale, rotation, tx: cb.x - (c * ca.x - s * ca.y), tz: cb.z - (s * ca.x + c * ca.y) };
  const residuals = pairs.map((p) => {
    const m = applyFit(fit, p.pdf);
    return Math.hypot(m.x - p.scene.x, m.z - p.scene.z);
  });
  return { ok: true, fit, residuals, exact: Math.max(...residuals) < EXACT };
}
