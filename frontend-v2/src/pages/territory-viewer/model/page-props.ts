import { computeUnitRatio } from "@/entities/measurement";
import {
  groupByModel,
  instanceName,
  type ResolvedPlacement,
} from "@/entities/placement";
import { groupDigits, type SceneViewModel } from "@/entities/scene";
import type { Detail } from "@/shared/ui/detail-list";
import type { SelectedBlockProps } from "@/widgets/placements-panel";
import { loadingChip, modeChip, stripItems } from "./strip-and-chips";
import { errorCopy, headerMeta, headerPills, railTools, uploadedLine } from "./viewer-view";
import type { ViewerCanvasProps } from "@/widgets/viewer-canvas";
import type { PageParts, TerritoryViewerPageProps } from "./viewer-props";

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
 * Task 15 wires the panorama half of the canvas; until then every territory
 * opens in the 3D view with no panoramas to show. Module-level so the refs and
 * the callbacks keep one identity across renders — a fresh object here would
 * re-run CameraTracker's effect on every keystroke in the panel.
 */
const NO_PANORAMA = {
  activePanorama: null,
  panoramaTexture: null,
  panoramaStatus: "idle",
  panoramaProgress: null,
  panoramaOpacity: 1,
  panoramas: [],
  showMarkers: true,
  markerLabels: {},
  move: { active: false, draggingId: null, livePos: null },
  cameraPositionRef: { current: null },
  cameraYawRef: { current: null },
  onActivatePanorama: () => {},
  onMarkerGrab: () => {},
  onMarkerMove: () => {},
  onMarkerDrop: () => {},
} satisfies Partial<ViewerCanvasProps>;

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

  const loadingLevel =
    !failed &&
    report.shown !== null &&
    report.target !== null &&
    report.shown !== report.target &&
    report.percent !== null &&
    report.progressText !== null
      ? { shown: report.shown, target: report.target, percent: report.percent, text: report.progressText }
      : null;

  const levels = vm.parentLods.map((a) => a.lod).sort((a, b) => a - b);
  const groups = groupByModel(p.placements, options);
  const selected = p.placements.find((x) => x.id === mode.selectedId) ?? null;

  return {
    header: {
      slug,
      title,
      pills: headerPills({
        ready: true,
        grants,
        mode: mode.mode,
        tourActive: p.tour.active,
        failed,
      }),
      // The tour's pill replaces the meta line rather than joining it (spec §4),
      // and a guest's right cluster carries the sentence instead.
      meta:
        failed || guest || p.tour.active || mode.mode === "measure"
          ? null
          : headerMeta(slug, vm.parentLods.length, vm.metadata.units),
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
      unitRatio: computeUnitRatio(vm.metadata.dims),
      resetVersion: view.resetVersion,
      retryVersion: view.retryVersion,
      focusRequest: view.focusRequest,
      ...NO_PANORAMA,
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
        loading: loadingLevel !== null,
        tourActive: p.tour.active,
      }),
      onReset: on.onReset,
      onMeasure: on.onMeasure,
      onAdd: on.onAdd,
      onReplayTour: on.onReplayTour,
      chip: failed || loadingLevel ? null : modeChip({ mode: mode.mode, measure: measure.summary }),
      loading: loadingLevel
        ? { chip: loadingChip(loadingLevel), percent: loadingLevel.percent, target: loadingLevel.target }
        : null,
      measuring:
        mode.mode === "measure"
          ? {
              onClear: on.onClearMeasurements,
              onCloseChain: on.onCloseActiveChain,
              canClear: measure.chains.length > 0,
              canClose: measure.activeChainId !== null,
            }
          : null,
      switcher:
        failed || levels.length < 2
          ? null
          : { levels, target: targetLod, shown: report.shown, onChange: on.onTargetLod },
      strip: stripItems({
        metadata: vm.metadata,
        shown: report.shown,
        target: failed ? error.lod : report.target,
        failed,
      }),
      hints: !failed && p.panel.collapsed && mode.mode === "orbit",
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
          details: detailsOf(slug, vm),
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

    tour: p.tour,
    loadingScene: !failed && report.shown === null,
  };
}

/** The View tab's key/value block: what this territory is, in the mock's order. */
const detailsOf = (slug: string, vm: SceneViewModel): Detail[] => [
  { label: "slug", value: slug, tone: "accent" },
  { label: "units", value: vm.metadata.units },
  { label: "vertices", value: groupDigits(vm.metadata.vertices) },
  { label: "faces", value: groupDigits(vm.metadata.faces) },
  { label: "uploaded", value: uploadedLine(vm.metadata.uploadedAt), tone: "muted" },
];

/**
 * The block under the object list. Its name comes from the grouped list rather
 * than the placement's own label, so the scene and the panel call the same
 * instance the same thing — `storage-tank-500 #1`, numbered by creation order.
 */
function selectedBlock(
  p: PageParts,
  groups: ReturnType<typeof groupByModel>,
  selected: ResolvedPlacement | null,
): SelectedBlockProps | null {
  if (!selected) return null;
  const group = groups.find((g) => g.model.slug === selected.modelSlug);
  const instance = group?.instances.find((i) => i.id === selected.id);
  if (!group || !instance) return null;

  return {
    name: instanceName(group, instance),
    gizmo: p.mode.gizmo,
    onGizmo: p.on.onGizmo,
    transform: { position: selected.position, rotation: selected.rotation, scale: selected.scale },
    snap: p.mode.snap,
    onSnap: p.on.onSnap,
    canWrite: p.grants.write,
    form: p.form,
    compact: p.view.compact,
  };
}
