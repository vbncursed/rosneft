import type { RefObject } from "react";
import type { Document } from "@/entities/document";
import type { CalibrationDraft, Panorama, PanoramaUpdate } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import type { DocumentWindowMode } from "@/features/document-view";
import type { useDocumentUpload } from "@/features/document-upload";
import type { PanoramaTextureState } from "@/features/panorama-view";
import type { usePanoramaUpload } from "@/features/panorama-upload";
import type { DocumentWindowProps } from "@/widgets/document-window";

/**
 * Everything `useViewerPanoramas` composes, in one object: the list, where the
 * camera is, the anchor being edited and the calibration draft over it, the
 * texture on the sphere, the in-scene marker drag, the tour link and the
 * upload dialog.
 *
 * The callbacks travel with the data rather than through `PageHandlers`
 * because every one of them is already a `useCallback` inside the feature hook
 * that owns it — routing them through the page would only re-wrap a stable
 * identity in a second one.
 */
export type PanoramaParts = {
  list: Panorama[];
  /** A mutation is in flight on this panorama; the card's Save waits for it. */
  pendingId: number | null;
  /** The panorama the camera is inside; null in the 3D view. */
  active: Panorama | null;
  /** The anchor card's target. Survives a switch back to the 3D view. */
  editing: Panorama | null;
  index: { current: number; total: number };
  texture: PanoramaTextureState;
  showMarkers: boolean;
  onToggleMarkers: () => void;
  /** The in-scene marker drag. The move sub-mode itself is the reducer's. */
  drag: {
    draggingId: number | null;
    livePos: Vec3 | null;
    begin: (id: number) => void;
    move: (point: Vec3) => void;
    end: () => void;
  };
  calibration: {
    active: boolean;
    /** The editing panorama with the unsaved draft applied; null when not calibrating. */
    effective: Panorama | null;
    draft: CalibrationDraft | null;
    opacity: number;
    /** How far one arrow press moves the anchor — one of NUDGE_STEPS' values. */
    step: number;
    onOpacity: (opacity: number) => void;
    onStep: (step: number) => void;
    onNudge: (axis: "x" | "y" | "z", delta: number) => void;
    onYaw: (radians: number) => void;
    onStart: () => void;
    onSave: () => void;
    onExit: () => void;
  };
  onEnter: (id: number) => void;
  onExit: () => void;
  /** P: 3D → first capture → next → … → 3D. The page routes the key here. */
  onCycle: () => void;
  onEdit: (id: number) => void;
  onCloseEditor: () => void;
  onToggleView: () => void;
  /** Both bound to the card's own target, which is the only one it can touch. */
  onSave: (patch: PanoramaUpdate) => void;
  onDelete: () => void;
  link: { url: string; saving: boolean; onSave: (url: string) => Promise<boolean> };
  upload: {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    form: ReturnType<typeof usePanoramaUpload>;
  };
  cameraPositionRef: RefObject<Vec3 | null>;
  cameraYawRef: RefObject<number | null>;
};

/** Everything `useViewerDocuments` composes: the list, the open window, the upload. */
export type DocumentParts = {
  list: Document[];
  /** The page attaches this to the layer the floating window is docked inside. */
  layerRef: RefObject<HTMLDivElement | null>;
  pendingId: number | null;
  active: Document | null;
  window: DocumentWindowMode;
  pip: DocumentWindowProps["pip"];
  onOpen: (id: number) => void;
  onWindow: (mode: DocumentWindowMode) => void;
  /** Bound to the open document — the only one the window can delete. */
  onDelete: () => void;
  onExit: () => void;
  /**
   * Escape: expanded steps back to pip, pip and collapsed close. Answers
   * whether it claimed the key, which is what `useViewerMode` asks of it.
   */
  escape: () => boolean;
  upload: {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    form: ReturnType<typeof useDocumentUpload>;
  };
};
