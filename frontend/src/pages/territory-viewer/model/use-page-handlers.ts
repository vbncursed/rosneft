import { useCallback, useState } from "react";
import type { PlacementGroup } from "@/entities/placement";
import type { LodChoice } from "@/entities/scene";
import type { useMeasurementTool } from "@/features/measure";
import type { Tour } from "@/features/onboarding";
import type { usePlacementsEditor } from "@/features/placements-editor";
import type { useViewerMode } from "@/features/viewer-mode";
import type { useOverlaysPanel } from "@/widgets/overlays-panel";
import type { DocumentParts } from "./overlay-parts";
import { revealSection, type Section } from "./reveal-section";
import { useClearMeasurements } from "./use-clear-measurements";
import { useFlyAround } from "./use-fly-around";
import { useLodHandlers } from "./use-lod-handlers";
import { usePlacementHandlers } from "./use-placement-handlers";
import type { usePlacementForm } from "./use-placement-form";
import type { PageHandlers, PageViewState } from "./viewer-props";

export type HandlerDeps = {
  mode: ReturnType<typeof useViewerMode>;
  measure: ReturnType<typeof useMeasurementTool>;
  editor: ReturnType<typeof usePlacementsEditor>;
  /** The group's own flag (D6); resolves true once the server stored it. */
  setGroupHidden: (id: number, hidden: boolean) => Promise<boolean>;
  /** So `onMoveToGroup` can tell a hidden destination from a shown one (§1.7). */
  groups: readonly PlacementGroup[];
  form: ReturnType<typeof usePlacementForm>;
  panel: ReturnType<typeof useOverlaysPanel>;
  tour: Tour;
  /** Only the documents: every panorama callback is already the parts' own. */
  documents: DocumentParts;
  /** Unfolds one View-tab list — the rail tile's "show me", remembered. */
  openSection: (section: Section) => void;
  /** `measurement:delete`: Clear then deletes the saved chains too, after asking. */
  canDeleteMeasurements: boolean;
};

/** The page's own state, plus the moment a failure arrived — `now`'s source. */
export type PageInteraction = {
  view: Omit<PageViewState, "compact" | "error" | "now">;
  failedAt: Date | null;
  on: PageHandlers;
};

/**
 * Everything the page does when something is pressed, and the little state
 * that belongs to no hook: the level asked for, the search box, the open
 * group, the picker. The LOD switcher's own state and Clear's ask-first dance
 * are `useLodHandlers`/`useClearMeasurements`, spread into the same shape.
 *
 * Split out of `useTerritoryViewer` at the 200-line cap. Every callback is
 * memoized because most of them are props on a tree that mounts WebGL, where a
 * fresh identity re-runs the effects that attach to the scene.
 */
export function usePageHandlers(d: HandlerDeps): PageInteraction {
  const {
    mode,
    measure,
    editor,
    setGroupHidden,
    groups,
    form,
    panel,
    tour,
    documents,
    openSection,
    canDeleteMeasurements,
  } = d;
  const [targetLod, setTargetLod] = useState<LodChoice>("auto");
  const [focusRequest, setFocusRequest] = useState<number[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const fly = useFlyAround(mode.state.mode, mode.state.view.kind);
  const land = fly.stop;
  const { report, failedAt, retryVersion, resetVersion, onLod, onReset, onRetry } = useLodHandlers({ land });
  // So does a focus: the next flight frame would overwrite it.
  const onFocus = useCallback(
    (id: number) => {
      land();
      setFocusRequest([id]);
    },
    [land],
  );
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
  const { placeGroupId, onAdd, onAddToGroup, onSetHidden, onSetGroupHidden, onMoveToGroup } = usePlacementHandlers({
    mode,
    editor,
    setGroupHidden,
    groups,
    openPicker,
  });
  const onPlace = useCallback(
    async (modelSlug: string, count: number) => {
      const id = await editor.create(modelSlug, count, placeGroupId);
      closePicker();
      // The batch already landed, so the new object is in the scene; the form
      // opens on the last of them to be named, and cancelling it deletes it.
      if (id !== null) form.openNew(id);
    },
    [editor, form, closePicker, placeGroupId],
  );

  // A rail tile is a way to the panel's own controls: it shows the tab they
  // live on, unfolds it if it was away, and scrolls to the section.
  const reveal = useCallback(
    (section: Section) => {
      panel.setTab("view");
      panel.setCollapsed(false);
      openSection(section);
      revealSection(section);
    },
    [panel, openSection],
  );
  const onPanoramas = useCallback(() => reveal("panoramas"), [reveal]);
  const onDocuments = useCallback(() => {
    // A window the reader hid comes back first — "Documents" that only
    // scrolled a list while the PDF stayed hidden would answer the wrong ask.
    if (documents.active && documents.window === "collapsed") documents.onWindow("pip");
    reveal("documents");
  }, [documents, reveal]);

  const { confirmClear, onClearMeasurements, onConfirmClear, onCancelClear } = useClearMeasurements({
    chains: measure.chains,
    clear: measure.clear,
    canDeleteMeasurements,
  });

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
      report,
      targetLod,
      retryVersion,
      resetVersion,
      playing: fly.playing,
      focusRequest,
      pickerOpen,
      query,
      expandedModel,
      confirmClear,
    },
    failedAt,
    on: {
      onPick: mode.select,
      onTransformCommit: editor.commitTransform,
      onMeasurePoint: measure.click,
      onCloseActiveChain: measure.closeActive,
      onRemoveSegment: measure.removeSegment,
      onRemoveChain: measure.removeChain,
      onLod,
      onReset,
      onPlay: fly.toggle,
      onPlayStop: fly.stop,
      onMeasure: mode.toggleMeasure,
      onAdd,
      onPanoramas,
      onDocuments,
      onReplayTour: tour.restart,
      onTargetLod: setTargetLod,
      onRetry,
      onClearMeasurements,
      onConfirmClear,
      onCancelClear,
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
      onSetHidden,
      onSetGroupHidden,
      onMoveToGroup,
      onAddToGroup,
      onToggleMove: mode.toggleMove,
    },
  };
}
