import { canEditSaved, computeUnitRatio } from "@/entities/measurement";
import { groupByModel } from "@/entities/placement";
import {
  documentProps,
  loadingLevel,
  panoramaCanvasProps,
  uploadProps,
  viewTabProps,
} from "./page-props-b";
import { selectedBlock, visibilityBlock } from "./page-props-selected";
import { loadingChip, measuringView, modeChip, stripItems } from "./strip-and-chips";
import { errorCopy, headerMeta, headerPills, measureGrants, railTools } from "./viewer-view";
import type { PageParts, TerritoryViewerPageProps } from "./viewer-props";

export type { DocumentParts, PanoramaParts } from "./overlay-parts";
export type {
  MeasuringView,
  PageHandlers,
  PageParts,
  PageViewState,
  StripView,
  SwitcherView,
  TerritoryViewerPageProps,
  ViewerErrorProps,
  ViewerHeaderProps,
  ViewerOverlaysProps,
  ViewerPanelProps,
} from "./viewer-props";

/**
 * Every prop the viewer page draws, assembled from the container's pieces.
 *
 * Pure and exhaustive on purpose: the page holds no hooks and takes no
 * decisions, so each of the mock's seventeen states is one call to this
 * function — which is what lets the fixtures show them without a gateway.
 */
export function pageProps(p: PageParts): TerritoryViewerPageProps {
  const { slug, title, grants, vm, options, mode, measure, view, on } = p;
  const { report, targetLod, error } = view;
  const failed = error !== null;
  const guest = !grants.create && !grants.write && !grants.delete;

  // A level is on screen, so the tools that need one may be used. A failure
  // says otherwise even if a coarse level is still drawn behind the card.
  const geometry = !failed && report.shown !== null;

  const loading = loadingLevel(view);
  const docs = documentProps(p);
  const inside = mode.view.kind === "panorama";

  const levels = vm.parentLods.map((a) => a.lod).sort((a, b) => a - b);
  const groups = groupByModel(p.placements, options);
  const selected = p.placements.find((x) => x.id === mode.selectedId) ?? null;

  return {
    header: {
      slug,
      title,
      description: p.description,
      pills: headerPills({
        ready: true,
        grants,
        mode: mode.mode,
        tourActive: p.tour.active,
        failed,
        view: mode.view,
        editing: mode.editingPanoramaId !== null,
      }),
      // The tour's pill replaces the meta line rather than joining it (spec §4),
      // and a guest's right cluster carries the sentence instead.
      // A document over the scene takes the line: it is the state the reader
      // most needs named, and the LOD line is still one fold of the panel away.
      meta:
        docs.meta ??
        (failed || guest || p.tour.active || mode.mode === "measure"
          ? null
          : headerMeta(slug, vm.parentLods.length, vm.metadata.units)),
      guest,
      canReplace: grants.replace,
    },

    canvas: {
      slug,
      parentLods: vm.parentLods,
      targetLod,
      placements: p.placements,
      mode: mode.mode,
      selectedId: mode.selectedId,
      gizmo: mode.gizmo,
      snap: mode.snap,
      canWrite: grants.write,
      chains: measure.chains,
      activeChainId: measure.activeChainId,
      showMeasurements: measure.show,
      canEditMeasurements: canEditSaved(measureGrants(grants)),
      unitRatio: computeUnitRatio(vm.metadata.dims),
      resetVersion: view.resetVersion,
      retryVersion: view.retryVersion,
      focusRequest: view.focusRequest,
      ...panoramaCanvasProps(p, groups),
      onPick: on.onPick,
      onTransformCommit: on.onTransformCommit,
      onMeasurePoint: on.onMeasurePoint,
      onCloseActiveChain: on.onCloseActiveChain,
      onRemoveSegment: on.onRemoveSegment,
      onRemoveChain: on.onRemoveChain,
      onLod: on.onLod,
    },

    overlays: {
      tools: railTools({
        grants,
        mode: mode.mode,
        geometry,
        loading: loading !== null,
        // Either tour: the replay tile lit under the panorama tour would
        // start the viewer's over the top of it, and the two are never both
        // on screen.
        tourActive: p.tour.active || p.panoramaTour.active,
        view: mode.view,
        documentOpen: docs.window !== null,
      }),
      onReset: on.onReset,
      onMeasure: on.onMeasure,
      onAdd: on.onAdd,
      onPanoramas: on.onPanoramas,
      onDocuments: on.onDocuments,
      onReplayTour: on.onReplayTour,
      // No chip over a failure, a download, or the scene skeleton: without a
      // mesh on screen (`!geometry`) there is nothing to drag or rotate.
      chip:
        !geometry || loading
          ? null
          : modeChip({
              mode: mode.mode,
              measure: measure.summary,
              view: mode.view,
              move: mode.move,
              calibrating: p.panoramas.calibration.active
                ? (p.panoramas.editing?.title ?? null)
                : null,
            }),
      loading: loading
        ? { chip: loadingChip(loading), percent: loading.percent, target: loading.target }
        : null,
      measuring: mode.mode === "measure" ? measuringView(p) : null,
      // Inside a capture the camera is in a photograph and the level behind it
      // cannot be chosen; under an open document the picker would sit beneath
      // the window. The mock draws none in either (states 9, 12, 13).
      switcher:
        failed || levels.length < 2 || inside || docs.window !== null
          ? null
          : { levels, target: targetLod, shown: report.shown, onChange: on.onTargetLod },
      strip: stripItems({
        metadata: vm.metadata,
        shown: report.shown,
        target: failed ? error.lod : report.target,
        failed,
      }),
      hints: !failed && p.panel.collapsed && mode.mode === "orbit",
      switchTo3d: inside ? p.panoramas.onExit : null,
      document: docs.window,
      documentLayerRef: p.documents.layerRef,
      error: error
        ? {
            copy: errorCopy(error, view.now),
            onRetry: on.onRetry,
            // Both, always: `failure` is cleared by the retry and by nothing
            // else, and while it is held no level is drawn — so a new target
            // on its own left the card exactly as it was.
            onCoarse: error.coarser
              ? () => {
                  on.onTargetLod(error.coarser!.lod);
                  on.onRetry();
                }
              : null,
          }
        : null,
    },

    panel: failed
      ? null
      : {
          tab: p.panel.tab,
          onTabChange: on.onTab,
          collapsed: p.panel.collapsed,
          onCollapsedChange: on.onCollapsed,
          placementsCount: p.placements.length,
          viewTab: viewTabProps(p),
          placements: {
            groups,
            query: view.query,
            onQuery: on.onQuery,
            expandedModel: view.expandedModel,
            onToggleGroup: on.onToggleGroup,
            selectedId: mode.selectedId,
            onSelect: on.onSelect,
            pendingIds: p.pendingIds,
            grants: { create: grants.create, write: grants.write, delete: grants.delete },
            onAdd: on.onAdd,
            onRename: on.onRename,
            onDelete: on.onDelete,
            onFocus: on.onFocus,
            selected: selectedBlock(p, groups, selected),
            // B-5: inside a panorama nothing is placed.
            canAdd: !inside,
            visibility: visibilityBlock(p, selected),
          },
        },

    picker: {
      open: view.pickerOpen,
      onClose: on.onClosePicker,
      territoryTitle: title,
      options,
      placing: p.placing,
      onPlace: on.onPlace,
    },

    upload: uploadProps(p),
    tour: p.tour,
    panoramaTour: p.panoramaTour,
    loadingScene: !failed && report.shown === null,
  };
}
