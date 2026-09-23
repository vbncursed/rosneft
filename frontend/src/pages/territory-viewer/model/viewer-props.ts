import type { RefObject } from "react";
import type { Chain, MeasurePoint } from "@/entities/measurement";
import type { PlacementTransform, ResolvedPlacement } from "@/entities/placement";
import type { ModelOption, SceneViewModel } from "@/entities/scene";
import type { ViewerError } from "@/features/lod";
import type { Tour } from "@/features/onboarding";
import type { GizmoMode, ViewerModeState } from "@/features/viewer-mode";
import type { DocumentWindowProps } from "@/widgets/document-window";
import type { PlaceObjectsModalProps } from "@/widgets/model-picker";
import type { OverlaysTab } from "@/widgets/overlays-panel";
import type { PlacementsPanelProps } from "@/widgets/placements-panel";
import type { UploadModalProps } from "@/widgets/upload-modal";
import type { FoldedSection, SectionFold, ViewTabProps } from "@/widgets/view-tab";
import type { LodReport, ViewerCanvasProps } from "@/widgets/viewer-canvas";
import type { DocumentParts, PanoramaParts } from "./overlay-parts";
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
  /** What the details editor opens with; the header itself does not print it. */
  description?: string;
  /** Opens the details editor. The screen supplies it, so a fixture draws no button. */
  onEdit?: () => void;
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
  /** The Clear question, while it is asked; null otherwise. */
  confirm: { title: string; onConfirm: () => void; onCancel: () => void } | null;
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
  /** The way out of a panorama, under the mode chip; null in the 3D scene. */
  switchTo3d: (() => void) | null;
  /** The PDF window, mounted for as long as a document is open — collapsed only hides it. */
  document: DocumentWindowProps | null;
  /**
   * Goes on the floating layer. The layer is the area the window may be docked
   * and dragged in, and `usePipWindow` measures it through this.
   */
  documentLayerRef: RefObject<HTMLDivElement | null>;
};

export type ViewerPanelProps = {
  tab: OverlaysTab;
  onTabChange: (tab: OverlaysTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  placementsCount: number;
  /** The whole View tab: the scene's facts, its panoramas and its documents. */
  viewTab: ViewTabProps;
  placements: PlacementsPanelProps;
};

export type TerritoryViewerPageProps = {
  header: ViewerHeaderProps;
  canvas: ViewerCanvasProps;
  overlays: ViewerOverlaysProps;
  /** Null on a failure: the mock draws the error card over an otherwise bare viewport. */
  panel: ViewerPanelProps | null;
  picker: PlaceObjectsModalProps;
  /** Whichever overlay upload is open — one dialog serves both kinds. */
  upload: UploadModalProps | null;
  tour: Tour;
  /** The panorama tour (Task 17); the viewer tour stands in until it is written. */
  panoramaTour: Tour;
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
  /** Asks first when saved chains would go (spec M-4); a reader's Clear keeps them. */
  onClearMeasurements: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
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
  /** The scene-only sub-mode for dragging panorama anchors (V). */
  onToggleMove: () => void;
  /** One checkbox of the selected placement's per-panorama allowlist. */
  onVisibility: (placementId: number, panoramaId: number, visible: boolean) => void;
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
  /** The Clear question is on screen. */
  confirmClear: boolean;
  compact: boolean;
  error: ViewerError | null;
  /** Passed in rather than read here, so the error card's clock is testable. */
  now: Date;
};

export type PageParts = {
  slug: string;
  title: string;
  description?: string;
  grants: Grants;
  vm: SceneViewModel;
  options: ModelOption[];
  mode: ViewerModeState;
  measure: {
    chains: Chain[];
    activeChainId: number | null;
    summary: { segments: number; total: string; unsaved: boolean };
    /** The View tab's ruler switch, as stored; measure mode overrides it on the canvas. */
    show: boolean;
    onToggleShow: () => void;
  };
  placements: ResolvedPlacement[];
  pendingIds: number[];
  placing: { total: number } | null;
  form: PlacementFormView | null;
  tour: Tour;
  panoramaTour: Tour;
  panoramas: PanoramaParts;
  documents: DocumentParts;
  panel: { tab: OverlaysTab; collapsed: boolean };
  /** The View tab's Panoramas and Documents folds (`useViewSections`). */
  sections: Record<FoldedSection, SectionFold>;
  view: PageViewState;
  on: PageHandlers;
};
