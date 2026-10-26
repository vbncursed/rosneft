import type { CalibrationPair } from "./auto-pairs";
import { GENERAL_LABEL, type ControlPoint } from "./control-points";
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

// controlScale is the plan's metres per page point from its own survey labels,
// independent of any model: the median over every pair of labels. Named ME
// marks are preferred; the bare "Plan point" is looser (mr1: 8 % off the marks)
// and is used only when fewer than two marks exist.
export function controlScale(all: ControlPoint[]): number | null {
  const named = all.filter((c) => c.label !== GENERAL_LABEL);
  const controls = named.length >= 2 ? named : all;
  const ratios = controls.flatMap((a, i) =>
    controls.slice(i + 1).flatMap((b) => {
      const d = dist(a.at, b.at);
      const metres = Math.hypot(a.e - b.e, a.n - b.n);
      return Number.isFinite(d) && Number.isFinite(metres) && d > MIN_SEPARATION_PT ? [metres / d] : [];
    }),
  );
  if (!ratios.length) return null;
  const sorted = ratios.toSorted((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// planScale prefers the plan's own labels: they do not depend on the pairs the
// user picked, and a model in local metres has pairs without UTM at all.
export function planScale(controls: ControlPoint[] | null, pairs: CalibrationPair[]): number | null {
  return (controls && controlScale(controls)) ?? drawingScale(pairs);
}

// How much larger the model is than the drawing, as a fraction (> 0: larger).
export function scaleDifference(fit: Similarity, unitRatio: number, metresPerPt: number): number {
  return (fit.scale * unitRatio) / metresPerPt - 1;
}
