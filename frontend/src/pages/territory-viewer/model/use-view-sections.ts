import type { ViewerModeState } from "@/features/viewer-mode";
import { useSectionFolds } from "@/widgets/view-tab";

export type SectionMode = Pick<ViewerModeState, "view" | "editingPanoramaId">;

/**
 * The View tab's two folds, and when the page holds them open regardless of
 * the reader's choice: Panoramas while a capture is stood in or edited (the
 * row that says so, and the anchor card under it, must be on screen), both
 * while a guided tour runs — its steps anchor into the lists.
 */
export function useViewSections(mode: SectionMode, touring: boolean) {
  return useSectionFolds({
    panoramas: touring || mode.view.kind === "panorama" || mode.editingPanoramaId !== null,
    documents: touring,
  });
}
