import type { CalibrationPair } from "./auto-pairs";
import { fitSimilarity } from "./fit-similarity";

/** Reject unreliable fits and choose a spatially spread subset for the calibration API. */
export function selectRegistrationPairs(
  pairs: CalibrationPair[],
  page: { width: number; height: number },
  unitRatio: number,
): CalibrationPair[] {
  if (pairs.length < 6 || !Number.isFinite(unitRatio) || unitRatio <= 0) return [];
  const fit = fitSimilarity(pairs);
  if (!fit.ok || fit.residuals.some((r) => !Number.isFinite(r) || r * unitRatio > 1)) return [];
  const xs = pairs.map((p) => p.pdf.x),
    ys = pairs.map((p) => p.pdf.y);
  if (Math.max(...xs) - Math.min(...xs) < page.width * 0.15 || Math.max(...ys) - Math.min(...ys) < page.height * 0.15)
    return [];
  // Normalised territory coordinates span at most two units. A tiny island
  // cannot safely establish a transform for the rest of the drawing.
  const sx = pairs.map((p) => p.scene.x),
    sz = pairs.map((p) => p.scene.z);
  if (Math.max(...sx) - Math.min(...sx) < 0.02 || Math.max(...sz) - Math.min(...sz) < 0.02) return [];
  const left = [...pairs];
  const chosen = [left.shift()!];
  while (left.length && chosen.length < 20) {
    const distance = (p: CalibrationPair) =>
      Math.min(
        ...chosen.map((q) => ((p.pdf.x - q.pdf.x) / page.width) ** 2 + ((p.pdf.y - q.pdf.y) / page.height) ** 2),
      );
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distance(left[i]) > distance(left[best])) best = i;
    chosen.push(left.splice(best, 1)[0]);
  }
  return chosen;
}
