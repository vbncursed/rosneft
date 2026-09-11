import { formatDims, groupDigits, type SceneMetadata } from "@/entities/scene";
import type { ViewerMode } from "@/features/viewer-mode";

/** What the mode chip says, per mode. Measure's tail is counted below. */
const ORBIT_CHIP = "orbit · drag to rotate";
const PLACE_CHIP = "place objects · click the ground";
const MEASURE_CHIP = "measure";

/** The strip's spans when nothing rendered, in the mock's order. */
const NO_GEOMETRY = ["no geometry loaded", "dimensions unavailable", "vertices —", "faces —"];

const level = (n: number | null) => (n === null ? "—" : `${n}`);

/**
 * The line under the tool rail: what the pointer does right now.
 *
 * In measure mode it doubles as the running total, but only once there is one
 * — "0 segments · 0.00 m total" is a readout of nothing, and the chip's job
 * before the first click is to say what mode you are in.
 *
 * `kbd` is the chip's optional keycap slot (`ModeChip`'s own prop). No mode in
 * this package sets one; the panorama chip in package B is what it is for.
 */
export function modeChip(a: {
  mode: ViewerMode;
  measure: { segments: number; total: string };
}): { text: string; kbd?: string } {
  if (a.mode === "orbit") return { text: ORBIT_CHIP };
  if (a.mode === "place") return { text: PLACE_CHIP };
  const { segments, total } = a.measure;
  if (segments === 0) return { text: MEASURE_CHIP };
  const counted = `${segments} ${segments === 1 ? "segment" : "segments"}`;
  return { text: `${MEASURE_CHIP} · ${counted} · ${total} total` };
}

/**
 * The bottom-left strip: the scene's facts, and which level they describe.
 *
 * A failure states the absence in words rather than leaving a spinner: the
 * mock's note is that the strip is what tells the reader nothing is loaded.
 * Before the first level arrives the LOD span is left out entirely — there is
 * no level to name yet, and "LOD — active" would read as a broken one.
 */
export function stripItems(a: {
  metadata: SceneMetadata;
  shown: number | null;
  target: number | null;
  failed: boolean;
}): { items: string[]; tone: "neutral" | "bad"; accentLast: boolean } {
  if (a.failed) {
    return {
      items: [...NO_GEOMETRY, `LOD ${level(a.target)} requested`],
      tone: "bad",
      accentLast: false,
    };
  }

  const { dims, vertices, faces } = a.metadata;
  const facts = [
    formatDims(dims),
    `${groupDigits(vertices)} vertices`,
    `${groupDigits(faces)} faces`,
  ];
  if (a.shown === null) return { items: facts, tone: "neutral", accentLast: false };

  const loading = a.shown !== a.target;
  const active = loading
    ? `LOD ${a.shown} active · LOD ${level(a.target)} loading`
    : `LOD ${a.shown} active`;
  return { items: [...facts, active], tone: "neutral", accentLast: loading };
}

/** The neutral chip beside the spinner: what is on screen, and how far the target has got. */
export const loadingChip = (p: { shown: number; target: number; text: string; percent: number }) =>
  `coarse LOD ${p.shown} shown · LOD ${p.target} ${p.percent}% · ${p.text}`;
