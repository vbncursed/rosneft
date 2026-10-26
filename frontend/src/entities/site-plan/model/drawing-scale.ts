import type { CalibrationPair } from "./auto-pairs";
import { dist } from "./geometry";
import type { Similarity } from "./fit-similarity";

const MIN_SEPARATION_PT = 1;

// drawingScale is the plan's metres per page point, from the pairs that carry
// UTM: total UTM distance over total page distance across every pair of them.
export function drawingScale(pairs: CalibrationPair[]): number | null {
  const utm = pairs.filter((p): p is CalibrationPair & { utm: { e: number; n: number } } => p.utm !== null);
  let [metres, points] = [0, 0];
  utm.forEach((a, i) =>
    utm.slice(i + 1).forEach((b) => {
      const d = dist(a.pdf, b.pdf);
      if (d < MIN_SEPARATION_PT) return;
      metres += Math.hypot(a.utm.e - b.utm.e, a.utm.n - b.utm.n);
      points += d;
    }),
  );
  return points > 0 ? metres / points : null;
}

// How much larger the model is than the drawing, as a fraction (> 0: larger).
export function scaleDifference(fit: Similarity, unitRatio: number, metresPerPt: number): number {
  return (fit.scale * unitRatio) / metresPerPt - 1;
}
