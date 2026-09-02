/** Where a source upload has got to on its way to a viewable GLB. */
export type ConversionStatus = "ready" | "converting" | "failed";

export type ConversionState = {
  status: ConversionStatus;
  /** 0–100 while converting; ignored otherwise. */
  progress?: number;
};

/** Only a finished conversion can be opened in the viewer. */
export const isOpenable = (state: ConversionState) => state.status === "ready";

/**
 * The footer note a catalog card shows on the right: a way in when the scene
 * is ready, how far along when it is not, and nothing when it failed — the
 * badge already says that, and repeating it twice reads as two problems.
 */
export function trailingNote(state: ConversionState): string | undefined {
  if (state.status === "ready") return "Open →";
  if (state.status === "converting") {
    return state.progress === undefined ? "Converting…" : `${Math.round(state.progress)}%`;
  }
  return undefined;
}
