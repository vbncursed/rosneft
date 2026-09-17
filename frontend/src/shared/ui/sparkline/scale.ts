export type Bar = {
  value: number;
  /** 0–100, relative to the tallest bar. */
  heightPct: number;
  /** The tallest bar, drawn in the accent. */
  peak: boolean;
  /** Past the point where the period is still filling in. */
  provisional: boolean;
};

/**
 * Scales a series to the tallest bar. The scale is relative on purpose: a
 * sparkline answers "what shape was this", not "what value was that" — the
 * caller prints the number it wants read.
 */
export function toBars(
  values: number[],
  dimFrom?: number,
  highlight: "peak" | "last" = "peak",
): Bar[] {
  const max = Math.max(0, ...values);
  const peakIndex = highlight === "last" ? values.length - 1 : values.indexOf(max);

  return values.map((value, index) => ({
    value,
    // An all-zero series draws a flat floor rather than dividing by zero.
    heightPct: max === 0 ? 0 : (value / max) * 100,
    // "peak" answers "when was it worst"; "last" answers "where is it now".
    peak: values.length > 0 && index === peakIndex && (highlight === "last" || max > 0),
    provisional: dimFrom !== undefined && index >= dimFrom,
  }));
}
