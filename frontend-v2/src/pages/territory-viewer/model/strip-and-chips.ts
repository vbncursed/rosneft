import { formatDims, groupDigits, type SceneMetadata } from "@/entities/scene";
import type { ViewerMode, ViewerView } from "@/features/viewer-mode";
import type { MeasuringView, PageParts } from "./viewer-props";
import { clearTitle } from "./viewer-view";

/** What the mode chip says, per mode. Measure's tail is counted below. */
const ORBIT_CHIP = "orbit · drag to rotate";
const PLACE_CHIP = "place objects · click the ground";
const MEASURE_CHIP = "measure";
const NOT_SAVED = " · not saved";
const PANORAMA_CHIP = "panorama · drag to look around";
const MOVE_CHIP = "move points · drag a marker";
const calibratingChip = (title: string) => `calibrating · ${title}`;

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
 * The order is the pointer's, not the panel's: inside the sphere a drag looks
 * around whatever the anchor card is doing, so the panorama line wins over
 * calibration. `kbd` is the chip's keycap slot (`ModeChip`'s own prop) and
 * names the key that leaves the sub-mode it describes.
 */
export function modeChip(a: {
  mode: ViewerMode;
  /** `unsaved`: the last finished chain is not on the server (spec D-1, D-4). */
  measure: { segments: number; total: string; unsaved: boolean };
  view: ViewerView;
  /** The scene-only sub-mode for dragging panorama anchors (V). */
  move: boolean;
  /** The title of the panorama being calibrated, or null. */
  calibrating: string | null;
}): { text: string; kbd?: string } {
  if (a.view.kind === "panorama") return { text: PANORAMA_CHIP, kbd: "P" };
  if (a.calibrating !== null) return { text: calibratingChip(a.calibrating) };
  if (a.move) return { text: MOVE_CHIP, kbd: "V" };
  if (a.mode === "orbit") return { text: ORBIT_CHIP };
  if (a.mode === "place") return { text: PLACE_CHIP };
  const { segments, total, unsaved } = a.measure;
  if (segments === 0) return { text: MEASURE_CHIP };
  const counted = `${segments} ${segments === 1 ? "segment" : "segments"}`;
  const tail = unsaved ? NOT_SAVED : "";
  return { text: `${MEASURE_CHIP} · ${counted} · ${total} total${tail}` };
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

/**
 * The measure bar's two buttons and the Clear question. A reader's Clear
 * leaves the saved chains, so it needs one of their own to take; the question
 * counts only the saved chains — the ones nobody can take back.
 */
export function measuringView({ grants, measure, view, on }: PageParts): MeasuringView {
  const saved = measure.chains.filter((c) => c.serverId != null).length;
  return {
    onClear: on.onClearMeasurements,
    onCloseChain: on.onCloseActiveChain,
    canClear: measure.chains.some((c) => grants.measureDelete || c.serverId == null),
    canClose: measure.activeChainId !== null,
    confirm: view.confirmClear
      ? { title: clearTitle(saved), onConfirm: on.onConfirmClear, onCancel: on.onCancelClear }
      : null,
  };
}
