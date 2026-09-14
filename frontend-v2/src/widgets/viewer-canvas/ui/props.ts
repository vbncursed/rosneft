import type { RefObject } from "react";
import type { Texture } from "three";
import type { Chain, MeasurePoint } from "@/entities/measurement";
import type { Panorama } from "@/entities/panorama";
import type { PlacementTransform, ResolvedPlacement, Vec3 } from "@/entities/placement";
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
  /** The active panorama, calibration draft already applied; null in the 3D view. */
  activePanorama: Panorama | null;
  panoramaTexture: Texture | null;
  panoramaStatus: "idle" | "loading" | "ready" | "error";
  panoramaProgress: number | null;
  /** < 1 ghosts the sphere for calibration. */
  panoramaOpacity: number;
  panoramas: Panorama[];
  showMarkers: boolean;
  /** Labels for the viewport markers inside a panorama, by placement id (`storage-tank-500 #1`). */
  markerLabels: Record<number, string>;
  move: { active: boolean; draggingId: number | null; livePos: Vec3 | null };
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
  onPick: (id: number | null) => void;
  onActivatePanorama: (id: number) => void;
  onMarkerGrab: (id: number) => void;
  onMarkerMove: (point: Vec3) => void;
  onMarkerDrop: () => void;
  onTransformCommit: (id: number, t: PlacementTransform) => void;
  onMeasurePoint: (p: MeasurePoint) => void;
  onCloseActiveChain: () => void;
  onRemoveSegment: (chainId: number, index: number) => void;
  onRemoveChain: (chainId: number) => void;
  onLod: (report: LodReport) => void;
};
