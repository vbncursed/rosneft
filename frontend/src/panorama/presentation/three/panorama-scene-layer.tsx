import { useEffect } from "react";
import type { RefObject } from "react";
import { Html } from "@react-three/drei";
import type { Mesh } from "three";
import type { Panorama } from "@/panorama/domain/panorama";
import type { PanoramaDragApi } from "@/panorama/application/use-panorama-drag";
import { usePanoramaTexture } from "@/panorama/application/use-panorama-texture";
import PanoramaSphere from "@/panorama/presentation/three/panorama-sphere";
import PanoramaRig from "@/panorama/presentation/three/panorama-rig";
import PanoramaLoadingBar from "@/panorama/presentation/components/panorama-loading-bar";
import PanoramaMarkersLayer from "@/panorama/presentation/three/panorama-markers-layer";
import PanoramaDragController from "@/panorama/presentation/three/panorama-drag-controller";

interface PanoramaSceneLayerProps {
  activePanorama: Panorama | null;
  panoramaRef: RefObject<Mesh | null>;
  calibrating: boolean;
  panoramaOpacity: number;
  onPanoramaError: (id: number) => void;
  panoramas: Panorama[];
  onActivatePanorama: (id: number) => void;
  showMarkers: boolean;
  measureMode: boolean;
  // Panorama "Move" mode; undefined when the parent hasn't opted in.
  move?: PanoramaDragApi;
}

// PanoramaSceneLayer is the panorama half of the scene: the equirect sphere
// skybox (when one is active), the clickable/draggable anchor markers (in 3D
// view), and the drag controller that suspends OrbitControls while a marker
// is being moved. While the equirect streams in it shows a full-screen
// progress bar so the switch from the 3D view isn't a blank wait.
export default function PanoramaSceneLayer({
  activePanorama,
  panoramaRef,
  calibrating,
  panoramaOpacity,
  onPanoramaError,
  panoramas,
  onActivatePanorama,
  showMarkers,
  measureMode,
  move,
}: PanoramaSceneLayerProps) {
  const draggingId = move?.draggingId ?? null;
  const { texture, progress, status } = usePanoramaTexture(
    activePanorama?.sourceBlobHash ?? null,
  );

  useEffect(() => {
    if (status === "error" && activePanorama) onPanoramaError(activePanorama.id);
  }, [status, activePanorama, onPanoramaError]);

  return (
    <>
      {activePanorama && status === "loading" && (
        <Html fullscreen>
          <div className="flex h-full w-full items-center justify-center bg-black">
            <PanoramaLoadingBar progress={progress} />
          </div>
        </Html>
      )}

      {activePanorama && status === "ready" && texture && (
        <>
          <PanoramaSphere
            panorama={activePanorama}
            texture={texture}
            meshRef={panoramaRef}
            opacity={calibrating ? panoramaOpacity : 1}
          />
          <PanoramaRig panorama={activePanorama} />
        </>
      )}

      {!activePanorama && !measureMode && showMarkers && (
        <PanoramaMarkersLayer
          panoramas={panoramas}
          onActivate={onActivatePanorama}
          moveMode={move?.moveMode ?? false}
          draggingId={draggingId}
          livePos={move?.livePos ?? null}
          onGrab={move?.begin}
        />
      )}

      <PanoramaDragController
        dragging={draggingId != null}
        onEnd={() => move?.end()}
      />
    </>
  );
}
