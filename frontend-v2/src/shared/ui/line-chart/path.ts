export type ChartGeometry = {
  /** Viewport the path is drawn in; the SVG scales it with preserveAspectRatio. */
  width: number;
  height: number;
  /** Space kept above the tallest point and below the lowest. */
  padTop: number;
  padBottom: number;
};

export const DEFAULT_GEOMETRY: ChartGeometry = {
  width: 300,
  height: 88,
  padTop: 12,
  padBottom: 6,
};

/**
 * The y for one value. Series share a maximum so several lines on one chart
 * stay comparable — scaling each to its own peak would make a flat line look
 * like a mountain beside a real one.
 */
export function scaleY(value: number, max: number, geo: ChartGeometry): number {
  const span = geo.height - geo.padTop - geo.padBottom;
  if (max <= 0) return geo.height - geo.padBottom;
  const clamped = Math.max(0, Math.min(value, max));
  return geo.height - geo.padBottom - (clamped / max) * span;
}

/**
 * An SVG polyline through the series. Empty for an empty series. A `null`
 * sample is a missed scrape, not a zero: it lifts the pen, so the path picks
 * up with a fresh `M` after the gap rather than drawing a slope across it.
 */
export function toLinePath(
  values: (number | null)[],
  max: number,
  geo: ChartGeometry = DEFAULT_GEOMETRY,
): string {
  if (values.length === 0) return "";
  // A single reading has no run to draw across, so it becomes a flat segment
  // rather than a point nobody can see.
  if (values.length === 1) {
    const [value] = values;
    if (value === null) return "";
    const y = scaleY(value, max, geo).toFixed(1);
    return `M0 ${y} L${geo.width} ${y}`;
  }

  const step = geo.width / (values.length - 1);
  let drawing = false;
  const segments: string[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const x = (i * step).toFixed(1);
    const y = scaleY(value, max, geo).toFixed(1);
    segments.push(`${drawing ? "L" : "M"}${x} ${y}`);
    drawing = true;
  });
  return segments.join(" ");
}

/**
 * The same line closed down to the baseline, for a filled area. A gap has no
 * honest fill — which side of it would the shading belong to — so the whole
 * area is skipped rather than guessed.
 */
export function toAreaPath(
  values: (number | null)[],
  max: number,
  geo: ChartGeometry = DEFAULT_GEOMETRY,
): string {
  if (values.includes(null)) return "";
  const line = toLinePath(values, max, geo);
  if (!line) return "";
  return `${line} L${geo.width} ${geo.height} L0 ${geo.height} Z`;
}

/** The tallest value across every series, which they then share. Gaps don't count. */
export function sharedMax(series: { values: (number | null)[] }[]): number {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = Math.max(0, ...all);
  // Guard the flat-zero case: dividing by it would put every point at NaN.
  return max === 0 ? 1 : max;
}
