import { Suspense } from "react";
import type { RefObject } from "react";
import type { Mesh } from "three";
import type { Panorama } from "@/panorama/domain/panorama";
import type { PanoramaDragApi } from "@/panorama/application/use-panorama-drag";
import PanoramaSphere from "@/panorama/presentation/three/panorama-sphere";
import PanoramaRig from "@/panorama/presentation/three/panorama-rig";
import PanoramaErrorBoundary from "@/panorama/presentation/components/panorama-error-boundary";
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
// skybox (when one is active), the clickable/draggable anchor markers (in
// 3D view), and the drag controller that suspends OrbitControls while a
// marker is being moved. Extracted from scene-canvas.tsx to keep that file
// under the 200-line cap and to co-locate the panorama scene concerns.
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
  return (
    <>
      {activePanorama && (
        <Suspense fallback={null}>
          <PanoramaErrorBoundary
            key={activePanorama.id}
            panoramaId={activePanorama.id}
            onError={onPanoramaError}
          >
            <PanoramaSphere
              panorama={activePanorama}
              meshRef={panoramaRef}
              opacity={calibrating ? panoramaOpacity : 1}
            />
          </PanoramaErrorBoundary>
          <PanoramaRig panorama={activePanorama} />
        </Suspense>
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
