import type { RefObject } from "react";
import type { Chain, MeasurePoint } from "@/entities/measurement";
import type { Panorama, PhaseHidden } from "@/entities/panorama";
import type { PlacementGroup, PlacementTransform, ResolvedPlacement, Vec3 } from "@/entities/placement";
import type { LodArtifact, LodChoice } from "@/entities/scene";
import type { LodFailure } from "@/features/lod";
import type { PreviewOutline } from "@/features/zone-editor";
import type { Zone } from "@/entities/zone";
import type { GizmoMode, ViewerMode } from "@/features/viewer-mode";
import type { Ground } from "../three/ground-probe";

/** The territory's progressive state, reported outward for the chips, the switcher and the error card. */
export type LodReport = {
  shown: number | null;
  target: number | null;
  percent: number | null;
  progressText: string | null;
  failure: LodFailure | null;
};

/** The plan editor's candidate squares on the ground; `selected` and `onSelect` speak the editor's rectangle indices. */
export type PlanPreview = {
  outlines: PreviewOutline[];
  selected: number | null;
  /** The picked rectangle's size label; only that one is written out. */
  label: string | null;
  onSelect: (index: number) => void;
};

/** The site zones feature, in one object so the page keeps one identity across a fold. */
export type SiteProps = {
  zones: Zone[];
  showZones: boolean;
  selectedZoneId: number | null;
  onSelectZone: (id: number | null) => void;
  /** Null while the editor is closed or its fit is not valid: nothing is previewed. */
  preview: PlanPreview | null;
  /** The ground probe is ready: heights under a point, and the median. */
  onGround: (ground: Ground) => void;
};

export type ViewerCanvasProps = {
  slug: string;
  parentLods: LodArtifact[];
  targetLod: LodChoice;
  placements: ResolvedPlacement[];
  /** The territory's user groups: a hidden one's members are neither drawn nor preloaded (D6). */
  placementGroups: PlacementGroup[];
  mode: ViewerMode;
  selectedId: number | null;
  gizmo: GizmoMode;
  snap: boolean;
  canWrite: boolean;
  chains: Chain[];
  activeChainId: number | null;
  /** Every measurement edit grant: a saved chain offers its remove buttons only then. */
  canEditMeasurements: boolean;
  unitRatio: number;
  resetVersion: number;
  /** Play: the camera flies around the territory until the page or the rig stops it. */
  playing: boolean;
  /** Free cam: FreeCamRig flies the camera and the orbit stands aside; the gizmo hides meanwhile. */
  free: boolean;
  /** G inside the free cam: the camera walks at eye height over the territory instead of flying. */
  walk: boolean;
  /** Bumped by the page's Retry: re-arms the boundary and clears the failure. */
  retryVersion: number;
  /** Instance ids to frame; a new array reference triggers a refit. */
  focusRequest: number[] | null;
  /**
   * The capture the camera is standing inside, calibration draft already
   * applied; null in the 3D view. It alone mounts `PanoramaRig`, so a draft
   * must never be substituted here from outside a capture — that would pin the
   * camera onto the anchor and take the free 3D view away.
   */
  activePanorama: Panorama | null;
  /**
   * The capture being aligned, draft applied, while the reader is NOT inside
   * one: it hangs the equirect around the scene as a ghosted backdrop. Null
   * otherwise — including inside, where `activePanorama` already carries the
   * draft.
   */
  calibrationGhost: Panorama | null;
  /** The decoded equirect; `PanoramaSphere` builds the texture and owns it. */
  panoramaBitmap: ImageBitmap | null;
  panoramaStatus: "idle" | "loading" | "ready" | "error";
  panoramaProgress: number | null;
  /** < 1 ghosts the sphere for calibration. */
  panoramaOpacity: number;
  /**
   * The overlay alignment is open. The camera stays where it was. From the 3D
   * view the viewport then shows the ghosted photo as a backdrop, the terrain,
   * and the edited anchor's ring alone — draggable, and editing the draft.
   * Inside a capture the ring is not drawable (the eye is standing on it), so
   * nudge and yaw are the tools. No object markers either way: the callout
   * asks the operator to drag the points, not to read the equipment.
   */
  calibrating: boolean;
  panoramas: Panorama[];
  /** Each job phase's shared flag: a hidden capture, or one of a hidden phase, gets no anchor (D5). */
  panoramaPhaseHidden: PhaseHidden;
  showMarkers: boolean;
  /** False in Points only: the panorama anchors draw without their titles. */
  markerNames: boolean;
  /** The View tab's ruler switch; measure mode draws the ruler regardless. */
  showMeasurements: boolean;
  /** Labels for the viewport markers inside a panorama, by placement id (`storage-tank-500 #1`). */
  markerLabels: Record<number, string>;
  move: { active: boolean; draggingId: number | null; livePos: Vec3 | null };
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
  site: SiteProps;
  /**
   * The next click on the model is a point the page asked for (aligning a
   * plan), not a measurement: the scene is hittable and the gizmo and zones
   * stand aside, as they do in the point modes.
   */
  pickScene: boolean;
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
  /** The rig ended the flight itself — a grab, or nothing to circle. */
  onPlayStop: () => void;
  /** Walk found no ground under the camera: the page goes back to flying and says why. */
  onWalkRefused: () => void;
};

/** The model page's viewer: one LOD chain, nothing else. */
export type ModelCanvasProps = {
  lods: LodArtifact[];
  retryVersion: number;
  onLod: (report: LodReport) => void;
  /** The scene could not start — no WebGL, or anything else that tore the Canvas down. */
  onUnavailable: () => void;
};
