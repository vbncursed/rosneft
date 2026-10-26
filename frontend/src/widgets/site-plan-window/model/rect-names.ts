import type { PlanRect } from "@/entities/site-plan";

/** "Rectangle 7.5 × 13.0 m"; twins get an ordinal, since two names must not be alike on one screen. */
export function rectNames(rects: PlanRect[], metresPerPt: number | null): string[] {
  const size = (r: PlanRect) =>
    metresPerPt === null
      ? `${r.widthPt.toFixed(0)} × ${r.heightPt.toFixed(0)} pt`
      : `${(r.widthPt * metresPerPt).toFixed(1)} × ${(r.heightPt * metresPerPt).toFixed(1)} m`;
  const names = rects.map((r) => `Rectangle ${size(r)}`);
  return names.map((n, i) => {
    const same = names.filter((m) => m === n).length;
    return same === 1 ? n : `${n}, ${names.slice(0, i + 1).filter((m) => m === n).length} of ${same}`;
  });
}
