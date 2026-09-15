import type { RefObject } from "react";
import type { Object3D } from "three";
import type { Panorama } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import type { ViewerCanvasProps } from "../ui/props";
import PanoramaDragController from "./panorama-drag-controller";
import PanoramaLoadingOverlay from "./panorama-loading-overlay";
import PanoramaMarkersLayer from "./panorama-markers-layer";
import PanoramaRig from "./panorama-rig";
import PanoramaSphere from "./panorama-sphere";

export interface PanoramaSceneProps {
  activePanorama: Panorama | null;
  bitmap: ImageBitmap | null;
  status: ViewerCanvasProps["panoramaStatus"];
  progress: number | null;
  opacity: number;
  panoramas: Panorama[];
  showMarkers: boolean;
  /** True whenever the canvas is picking points rather than editing. */
  pointMode: boolean;
  move: ViewerCanvasProps["move"];
  territoryRef: RefObject<Object3D | null>;
  onActivate: (id: number) => void;
  onGrab: (id: number) => void;
  onMove: (point: Vec3) => void;
  onDrop: () => void;
}

// PanoramaScene is the panorama half of the canvas: the equirect sphere and
// the rig that holds the camera at its anchor, the cover that fills the switch
// while the photo streams in, the anchor markers of the 3D view, and the
// controller that owns a marker drag. Split out of SceneCanvas so neither file
// has to be read whole to follow the other.
//
// Mount it ABOVE <CameraRig> and OUTSIDE <Bounds>: the rig restores the
// controls CameraRig disposes, and React runs sibling cleanups in tree order;
// a radius-50 sphere inside Bounds would dominate the auto-fit.
export default function PanoramaScene({
  activePanorama,
  bitmap,
  status,
  progress,
  opacity,
  panoramas,
  showMarkers,
  pointMode,
  move,
  territoryRef,
  onActivate,
  onGrab,
  onMove,
  onDrop,
}: PanoramaSceneProps) {
  return (
    <>
      {activePanorama && status === "loading" ? <PanoramaLoadingOverlay progress={progress} /> : null}

      {activePanorama && status === "ready" && bitmap ? (
        <>
          <PanoramaSphere panorama={activePanorama} bitmap={bitmap} opacity={opacity} />
          <PanoramaRig panorama={activePanorama} />
        </>
      ) : null}

      {/* Anchors belong to the 3D view only: inside a panorama the reader is
          standing on one of them, and while picking points they would eat the
          click meant for the surface. */}
      {!activePanorama && !pointMode && showMarkers ? (
        <PanoramaMarkersLayer
          panoramas={panoramas}
          onActivate={onActivate}
          moveMode={move.active}
          draggingId={move.draggingId}
          livePos={move.livePos}
          onGrab={onGrab}
        />
      ) : null}

      {/* Always mounted: it is what re-enables the orbit, and a controller
          that unmounts with the grab would drop the release that ends it. */}
      <PanoramaDragController
        dragging={move.draggingId !== null}
        territoryRef={territoryRef}
        onMove={onMove}
        onEnd={onDrop}
      />
    </>
  );
}
