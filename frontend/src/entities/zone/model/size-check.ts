import { zoneSizeM } from "./zone-geometry";
import type { Zone } from "./zone";

const WARN_ABOVE_PCT = 3;

const metres = (v: number) => v.toFixed(1);
const pctText = (pct: number) => {
  const n = Math.round(pct);
  return n === 0 ? "0 %" : `${n < 0 ? "−" : "+"}${Math.abs(n)} %`;
};

/** Drawn size against the model's, in words; the larger side deviation decides. Null without a drawing size. */
export function sizeCheck(zone: Zone, unitRatio: number): { text: string; warn: boolean } | null {
  const { drawingWidthM: dw, drawingHeightM: dh } = zone;
  if (dw === null || dh === null) return null;
  const { width, height } = zoneSizeM(zone, unitRatio);
  const pcts = [((width - dw) / dw) * 100, ((height - dh) / dh) * 100];
  const pct = pcts.reduce((worst, p) => (Math.abs(p) > Math.abs(worst) ? p : worst));
  const warn = Math.abs(pct) - WARN_ABOVE_PCT > 1e-9; // float noise must not tip exactly 3 %
  const text = `Drawing ${metres(dw)} × ${metres(dh)} m · Model ${metres(width)} × ${metres(height)} m (${pctText(pct)})`;
  return { text: warn ? `${text} · differs from the drawing by more than ${WARN_ABOVE_PCT} %` : text, warn };
}
