import type { Chain, MeasurePoint } from "@/entities/measurement";
import type { PlacementTransform, ResolvedPlacement } from "@/entities/placement";
import type { ModelOption, SceneViewModel } from "@/entities/scene";
import type { ViewerError } from "@/features/lod";
import type { Tour } from "@/features/onboarding";
import type { GizmoMode, ViewerModeState } from "@/features/viewer-mode";
import type { Detail } from "@/shared/ui/detail-list";
import type { PlaceObjectsModalProps } from "@/widgets/model-picker";
import type { OverlaysTab } from "@/widgets/overlays-panel";
import type { PlacementsPanelProps } from "@/widgets/placements-panel";
import type { LodReport, ViewerCanvasProps } from "@/widgets/viewer-canvas";
import type { PlacementFormView } from "./use-placement-form";
import type { ErrorCopy, Grants, HeaderPill, RailToolState } from "./viewer-view";

/**
 * Every shape the viewer page is drawn from, and every piece the container
 * hands `pageProps` to build them. Split from `page-props.ts` so neither file
 * runs past the 200-line cap; the builder re-exports them, so nothing outside
 * this slice needs to know there are two files.
 */

export type ViewerHeaderProps = {
  slug: string;
  title: string;
  pills: HeaderPill[];
  /** Null where the mock gives the room to something else: measuring, a guest, a failure. */
  meta: string | null;
  guest: boolean;
  canReplace: boolean;
};

export type ViewerErrorProps = {
  copy: ErrorCopy;
  onRetry: () => void;
  /** Null exactly when `copy.coarseLabel` is: there is no coarser level to fall back to. */
  onCoarse: (() => void) | null;
};

export type StripView = { items: string[]; tone: "neutral" | "bad"; accentLast: boolean };
export type SwitcherView = {
  levels: number[];
  target: number;
  shown: number | null;
  onChange: (lod: number) => void;
};
export type MeasuringView = {
  onClear: () => void;
  onCloseChain: () => void;
  canClear: boolean;
  canClose: boolean;
};

export type ViewerOverlaysProps = {
  tools: RailToolState[];
  onReset: () => void;
  onMeasure: () => void;
  onAdd: () => void;
  /** The two overlay tiles: reveal that section of the View tab (Task 15's `revealSection`). */
  onPanoramas: () => void;
  onDocuments: () => void;
  onReplayTour: () => void;
  /** Null while the loading chips stand in for it, and on a failure. */
  chip: { text: string; kbd?: string } | null;
  loading: { chip: string; percent: number; target: number } | null;
  measuring: MeasuringView | null;
  switcher: SwitcherView | null;
  strip: StripView;
  hints: boolean;
  error: ViewerErrorProps | null;
};

export type ViewerPanelProps = {
  tab: OverlaysTab;
  onTabChange: (tab: OverlaysTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  placementsCount: number;
  details: Detail[];
  placements: PlacementsPanelProps;
};

export type TerritoryViewerPageProps = {
  header: ViewerHeaderProps;
  canvas: ViewerCanvasProps;
  overlays: ViewerOverlaysProps;
  /** Null on a failure: the mock draws the error card over an otherwise bare viewport. */
  panel: ViewerPanelProps | null;
  picker: PlaceObjectsModalProps;
  tour: Tour;
  /** Nothing on screen yet and nothing failed — the skeleton card stands in. */
  loadingScene: boolean;
};

/** Every callback the page hands out. The container memoizes each one. */
export type PageHandlers = {
  onPick: (id: number | null) => void;
  onTransformCommit: (id: number, transform: PlacementTransform) => void;
  onMeasurePoint: (point: MeasurePoint) => void;
  onCloseActiveChain: () => void;
  onRemoveSegment: (chainId: number, index: number) => void;
  onRemoveChain: (chainId: number) => void;
  onLod: (report: LodReport) => void;
  onReset: () => void;
  onMeasure: () => void;
  onAdd: () => void;
  onPanoramas: () => void;
  onDocuments: () => void;
  onReplayTour: () => void;
  /** The switcher and the error card's way out share one setter. */
  onTargetLod: (lod: number) => void;
  onRetry: () => void;
  onClearMeasurements: () => void;
  onTab: (tab: OverlaysTab) => void;
  onCollapsed: (collapsed: boolean) => void;
  onQuery: (query: string) => void;
  onToggleGroup: (slug: string) => void;
  onSelect: (id: number | null) => void;
  onRename: (id: number) => void;
  onDelete: (id: number) => void;
  onFocus: (id: number) => void;
  onGizmo: (gizmo: GizmoMode) => void;
  onSnap: (on: boolean) => void;
  onPlace: (slug: string, count: number) => void;
  onClosePicker: () => void;
};

/** The page's own state, everything the hooks do not already own. */
export type PageViewState = {
  report: LodReport;
  targetLod: number;
  retryVersion: number;
  resetVersion: number;
  focusRequest: number[] | null;
  pickerOpen: boolean;
  query: string;
  expandedModel: string | null;
  compact: boolean;
  error: ViewerError | null;
  /** Passed in rather than read here, so the error card's clock is testable. */
  now: Date;
};

export type PageParts = {
  slug: string;
  title: string;
  grants: Grants;
  vm: SceneViewModel;
  options: ModelOption[];
  mode: ViewerModeState;
  measure: {
    chains: Chain[];
    activeChainId: number | null;
    summary: { segments: number; total: string };
  };
  placements: ResolvedPlacement[];
  pendingIds: number[];
  placing: { done: number; total: number } | null;
  form: PlacementFormView | null;
  tour: Tour;
  panel: { tab: OverlaysTab; collapsed: boolean };
  view: PageViewState;
  on: PageHandlers;
};
