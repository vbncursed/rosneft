export type CoverageTone = "ok" | "warn" | "bad" | "neutral";

export type CoverageSegment = {
  tone: CoverageTone;
  value: number;
  label: string;
};

/**
 * Share of the whole, rounded for display only. The bar itself is laid out
 * with flex-grow, so the segments always add up to the full width — rounding
 * each to a percentage independently leaves a gap or an overflow.
 */
export function share(segments: CoverageSegment[], index: number): number {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return 0;
  return Math.round((segments[index].value / total) * 100);
}

/** "18 of 26 — 2FA + passkey 69%, 2FA only 12%, password only 19%" */
export function coverageSummary(label: string, segments: CoverageSegment[]): string {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return `${label}: nothing to show`;
  const parts = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.value > 0)
    .map(({ segment, index }) => `${segment.label} ${share(segments, index)}%`);
  return `${label}: ${parts.join(", ")}`;
}
