import { useCallback, useState } from "react";
import type { useMeasurementTool } from "@/features/measure";
import type { Tour } from "@/features/onboarding";
import type { usePlacementsEditor } from "@/features/placements-editor";
import type { useViewerMode } from "@/features/viewer-mode";
import type { useOverlaysPanel } from "@/widgets/overlays-panel";
import type { LodReport } from "@/widgets/viewer-canvas";
import type { DocumentParts } from "./overlay-parts";
import { revealSection, type Section } from "./reveal-section";
import type { usePlacementForm } from "./use-placement-form";
import type { PageHandlers, PageViewState } from "./viewer-props";

export type HandlerDeps = {
  mode: ReturnType<typeof useViewerMode>;
  measure: ReturnType<typeof useMeasurementTool>;
  editor: ReturnType<typeof usePlacementsEditor>;
  form: ReturnType<typeof usePlacementForm>;
  panel: ReturnType<typeof useOverlaysPanel>;
  tour: Tour;
  /** Only the documents: every panorama callback is already the parts' own. */
  documents: DocumentParts;
};

/** The page's own state, plus the moment a failure arrived — `now`'s source. */
export type PageInteraction = {
  view: Omit<PageViewState, "compact" | "error" | "now">;
  failedAt: Date | null;
  on: PageHandlers;
};

const NO_REPORT: LodReport = {
  shown: null,
  target: null,
  percent: null,
  progressText: null,
  failure: null,
};

/**
 * The canvas's last report, with the moment its failure arrived.
 *
 * The error card's footer answers "when did this last try", so the clock is
 * stamped when the failure lands rather than read while the card is being
 * drawn — otherwise every re-render behind it (a reset, a panel fold, a
 * refetch) moved "last attempt" forward to now.
 */
type LodState = { report: LodReport; failedAt: Date | null };

const NO_LOD: LodState = { report: NO_REPORT, failedAt: null };

/**
 * Everything the page does when something is pressed, and the little state
 * that belongs to no hook: the level asked for, the two version counters, the
 * search box, the open group, the picker.
 *
 * Split out of `useTerritoryViewer` at the 200-line cap. Every callback is
 * memoized because most of them are props on a tree that mounts WebGL, where a
 * fresh identity re-runs the effects that attach to the scene.
 */
export function usePageHandlers(d: HandlerDeps): PageInteraction {
  const { mode, measure, editor, form, panel, tour, documents } = d;
  const [targetLod, setTargetLod] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [focusRequest, setFocusRequest] = useState<number[] | null>(null);
  const [lod, setLod] = useState<LodState>(NO_LOD);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const onLod = useCallback(
    (next: LodReport) =>
      setLod((prev) => ({
        report: next,
        // A second failure of the same level is the same attempt still being
        // reported; a different hash is a new one and gets a new stamp.
        failedAt: next.failure
          ? prev.report.failure?.hash === next.failure.hash
            ? prev.failedAt
            : new Date()
          : null,
      })),
    [],
  );
  const onReset = useCallback(() => setResetVersion((v) => v + 1), []);
  const onRetry = useCallback(() => setRetryVersion((v) => v + 1), []);
  const onFocus = useCallback((id: number) => setFocusRequest([id]), []);
  const onToggleGroup = useCallback(
    (modelSlug: string) => setExpandedModel((open) => (open === modelSlug ? null : modelSlug)),
    [],
  );
  const openPicker = useCallback(() => {
    mode.enterPlace();
    setPickerOpen(true);
  }, [mode]);
  const closePicker = useCallback(() => {
    mode.exitPlace();
    setPickerOpen(false);
  }, [mode]);
  const onPlace = useCallback(
    async (modelSlug: string, count: number) => {
      const id = await editor.create(modelSlug, count);
      closePicker();
      // The POSTs already landed, so the new object is in the scene; the form
      // opens on the last of them to be named, and cancelling it deletes it.
      if (id !== null) form.openNew(id);
    },
    [editor, form, closePicker],
  );

  // A rail tile is a way to the panel's own controls: it shows the tab they
  // live on, unfolds it if it was away, and scrolls to the section.
  const reveal = useCallback(
    (section: Section) => {
      panel.setTab("view");
      panel.setCollapsed(false);
      revealSection(section);
    },
    [panel],
  );
  const onPanoramas = useCallback(() => reveal("panoramas"), [reveal]);
  const onDocuments = useCallback(() => {
    // A window the reader hid comes back first — "Documents" that only
    // scrolled a list while the PDF stayed hidden would answer the wrong ask.
    if (documents.active && documents.window === "collapsed") documents.onWindow("pip");
    reveal("documents");
  }, [documents, reveal]);

  // keepSaved stays false until M6 reads it off measurement:delete.
  const clearMeasurements = measure.clear;
  const onClearMeasurements = useCallback(() => clearMeasurements(false), [clearMeasurements]);

  const onVisibility = useCallback(
    (placementId: number, panoramaId: number, visible: boolean) => {
      const current = editor.placements.find((x) => x.id === placementId);
      if (!current) return;
      const ids = current.visiblePanoramaIds.filter((x) => x !== panoramaId);
      void editor.setVisibility(placementId, visible ? [...ids, panoramaId] : ids);
    },
    [editor],
  );

  return {
    view: {
      report: lod.report,
      targetLod,
      retryVersion,
      resetVersion,
      focusRequest,
      pickerOpen,
      query,
      expandedModel,
    },
    failedAt: lod.failedAt,
    on: {
      onPick: mode.select,
      onTransformCommit: editor.commitTransform,
      onMeasurePoint: measure.click,
      onCloseActiveChain: measure.closeActive,
      onRemoveSegment: measure.removeSegment,
      onRemoveChain: measure.removeChain,
      onLod,
      onReset,
      onMeasure: mode.toggleMeasure,
      onAdd: openPicker,
      onPanoramas,
      onDocuments,
      onReplayTour: tour.restart,
      onTargetLod: setTargetLod,
      onRetry,
      onClearMeasurements,
      onTab: panel.setTab,
      onCollapsed: panel.setCollapsed,
      onQuery: setQuery,
      onToggleGroup,
      onSelect: mode.select,
      onRename: form.openRename,
      onDelete: editor.remove,
      onFocus,
      onGizmo: mode.setGizmo,
      onSnap: mode.toggleSnap,
      onPlace,
      onClosePicker: closePicker,
      onVisibility,
      onToggleMove: mode.toggleMove,
    },
  };
}
