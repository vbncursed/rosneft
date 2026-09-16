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
  /** The draft hung around the 3D view as a backdrop — see `ViewerCanvasProps`. */
  calibrationGhost: Panorama | null;
  bitmap: ImageBitmap | null;
  status: ViewerCanvasProps["panoramaStatus"];
  progress: number | null;
  opacity: number;
  panoramas: Panorama[];
  showMarkers: boolean;
  /** True whenever the canvas is picking points rather than editing. */
  pointMode: boolean;
  /** The overlay alignment is open — see `ViewerCanvasProps`. */
  calibrating: boolean;
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
  calibrationGhost,
  bitmap,
  status,
  progress,
  opacity,
  panoramas,
  showMarkers,
  pointMode,
  calibrating,
  move,
  territoryRef,
  onActivate,
  onGrab,
  onMove,
  onDrop,
}: PanoramaSceneProps) {
  // The sphere's subject: the capture the reader is inside, or — out in the 3D
  // view — the one being aligned, whose photo becomes the backdrop. The two are
  // mutually exclusive by construction (the page nulls the ghost inside).
  const sphere = activePanorama ?? calibrationGhost;

  return (
    <>
      {/* Only inside. Out in the 3D view the photo is a backdrop the operator
          asked for on top of a scene they can already see; covering it would
          take the scene away to announce a download. */}
      {activePanorama && status === "loading" ? <PanoramaLoadingOverlay progress={progress} /> : null}

      {sphere && status === "ready" && bitmap ? (
        <PanoramaSphere panorama={sphere} bitmap={bitmap} opacity={opacity} />
      ) : null}

      {/* The rig teleports the eye onto the anchor, so it follows the capture
          the reader is *in* — never the ghost. Calibrating from the 3D view
          keeps the free camera, which is the whole point of doing it there. */}
      {activePanorama && status === "ready" && bitmap ? (
        <PanoramaRig panorama={activePanorama} />
      ) : null}

      {/* Anchors belong to the 3D view only: inside a panorama the reader is
          standing on one of them — including the one being aligned, where the
          ring would project onto the eye — and while picking points they would
          eat the click meant for the surface. While calibrating the layer is
          handed the draft alone: it is the only ring drawn, the only one
          grabbable, and `V` therefore cannot reach another anchor's PUT. */}
      {!activePanorama && !pointMode && showMarkers ? (
        <PanoramaMarkersLayer
          panoramas={calibrationGhost ? [calibrationGhost] : panoramas}
          onActivate={onActivate}
          moveMode={move.active || calibrating}
          editingId={calibrating ? (calibrationGhost?.id ?? null) : null}
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
