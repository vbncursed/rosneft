import type { Chain, MeasurePoint } from "@/entities/measurement";
import type { PlacementTransform, ResolvedPlacement } from "@/entities/placement";
import type { LodArtifact } from "@/entities/scene";
import type { LodFailure } from "@/features/lod";
import type { GizmoMode, ViewerMode } from "@/features/viewer-mode";

/** The territory's progressive state, reported outward for the chips, the switcher and the error card. */
export type LodReport = {
  shown: number | null;
  target: number | null;
  percent: number | null;
  progressText: string | null;
  failure: LodFailure | null;
};

export type ViewerCanvasProps = {
  slug: string;
  parentLods: LodArtifact[];
  targetLod: number;
  placements: ResolvedPlacement[];
  mode: ViewerMode;
  selectedId: number | null;
  gizmo: GizmoMode;
  snap: boolean;
  canWrite: boolean;
  chains: Chain[];
  activeChainId: number | null;
  unitRatio: number;
  resetVersion: number;
  /** Bumped by the page's Retry: re-arms the boundary and clears the failure. */
  retryVersion: number;
  /** Instance ids to frame; a new array reference triggers a refit. */
  focusRequest: number[] | null;
  onPick: (id: number | null) => void;
  onTransformCommit: (id: number, t: PlacementTransform) => void;
  onMeasurePoint: (p: MeasurePoint) => void;
  onCloseActiveChain: () => void;
  onRemoveSegment: (chainId: number, index: number) => void;
  onRemoveChain: (chainId: number) => void;
  onLod: (report: LodReport) => void;
};
