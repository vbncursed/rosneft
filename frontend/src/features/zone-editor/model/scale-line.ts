const WARN_ABOVE_PCT = 3;

/** The scale-agreement line of the align panel; `diff` is a fraction, > 0 when the model is larger. */
export function scaleLine(diff: number): { text: string; warn: boolean } {
  const pct = Math.abs(diff) * 100;
  if (pct.toFixed(1) === "0.0") return { text: "Model matches the drawing scale", warn: false };
  const text = `Model is ${pct.toFixed(1)} % ${diff > 0 ? "larger" : "smaller"} than the drawing`;
  const warn = pct - WARN_ABOVE_PCT > 1e-9;
  return { text: warn ? `${text}. Check that the points match.` : text, warn };
}
