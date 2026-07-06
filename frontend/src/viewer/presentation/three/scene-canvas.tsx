import { Suspense, useCallback, useMemo, useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { AdaptiveDpr, Bounds } from "@react-three/drei";
import type { Group, Mesh } from "three";
import CameraRig from "@/viewer/presentation/three/camera-rig";
import Lighting from "@/viewer/presentation/three/lighting";
import GltfModel from "@/viewer/presentation/three/gltf-model";
import GlbPreloader from "@/viewer/presentation/three/glb-preloader";
import Ktx2Init from "@/viewer/presentation/three/ktx2-init";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import MeasurementLayer from "@/measurement/presentation/three/measurement-layer";
import type { Chain } from "@/measurement/domain/chain";
import type { MeasurePoint } from "@/measurement/domain/measurement";
import type { GizmoMode } from "@/placement/domain/gizmo-mode";
import type {
  PlacementTransform,
  ResolvedPlacement,
} from "@/placement/domain/placement";
import PlacementsLayer from "@/placement/presentation/three/placements-layer";
import type { Panorama } from "@/panorama/domain/panorama";
import type { PanoramaDragApi } from "@/panorama/application/use-panorama-drag";
import PanoramaSceneLayer from "@/panorama/presentation/three/panorama-scene-layer";
import CameraPositionTracker from "@/panorama/presentation/three/camera-position-tracker";
import type { Vec3 } from "@/shared/domain/vec3";
import type { RefObject } from "react";

// Stable literal references so react-three-fiber doesn't tear down and
// recreate the gridHelper / background colour on every render of this
// component. RTF reconciles `args` by reference; new array literals each
// render trigger a dispose+reconstruct cycle for the underlying
// THREE.Object3D.
// near=0.1 (not 0.01) keeps the depth-buffer precision sane against
// far=500 — log2(500/0.1) fits a 24-bit depth buffer comfortably; 500/0.01
// invites Z-fighting on coplanar geometry without a measurable benefit
// at the converter's normalised scale (max-axis = 2).
const CAMERA = { position: [0, 0, 3] as [number, number, number], fov: 50, near: 0.1, far: 500 };
// Lower bound is intentionally below 1: AdaptiveDpr drops dpr toward the
// lower bound while CameraRig is calling performance.regress() during a
// wheel zoom. Half-resolution renders are ~4x cheaper per pixel and read
// fine for the few hundred ms of an active gesture; full quality is
// restored once the gesture ends.
const DPR_RANGE: [number, number] = [0.5, 1.5];
const GL_CONFIG = { antialias: true, alpha: false };
const BG_ARGS: [string] = ["#121212"];
const GRID_ARGS: [number, number, string, string] = [6, 24, "#2f2f2f", "#1e1e1e"];
const GRID_POSITION: [number, number, number] = [0, -1.2, 0];

interface SceneCanvasProps {
  parentLods: LodArtifact[];
  resetVersion: number;
  placements: ResolvedPlacement[];
  selectedId: number | null;
  mode: GizmoMode;
  measureMode: boolean;
  snapEnabled: boolean;
  // Gates the in-scene transform gizmo. Computed outside the Canvas (context
  // can't cross the R3F boundary) and threaded down to PlacementsLayer.
  canEditPlacements: boolean;
  // When non-null, the viewer renders the panorama sphere skybox in
  // place of the territory mesh. Placements still render against the
  // same coordinate space; snap targets the sphere instead of the
  // territory floor.
  activePanorama: Panorama | null;
  // Full panorama list + activator for the in-scene markers shown in 3D view.
  panoramas: Panorama[];
  onActivatePanorama: (id: number) => void;
  // Panorama "Move" mode as one cohesive object. Optional so the scene
  // behaves exactly as before until ModelViewer opts in.
  panoramaMove?: PanoramaDragApi;
  // Toggles the in-scene panorama markers (the clickable points in 3D).
  showMarkers: boolean;
  // Overlay-calibration: show the model under a ghosted, semi-transparent
  // panorama photo so the operator can align anchor + yaw.
  calibrating: boolean;
  panoramaOpacity: number;
  // Ref mutated by an in-Canvas tracker so the parent can read the
  // current camera position on demand (e.g. "Set panorama anchor from
  // camera"). Lives in ModelViewer; SceneCanvas just wires it through.
  cameraPositionRef: RefObject<Vec3 | null>;
  // Called when the active panorama's equirect texture fails to load
  // (e.g. a non-image blob). The boundary swallows the error so the scene
  // survives; this lets the parent flag the broken capture.
  onPanoramaError: (id: number) => void;
  chains: Chain[];
  activeChainId: number | null;
  unitRatio: number;
  onSelect: (id: number | null) => void;
  onCommit: (id: number, transform: PlacementTransform) => void;
  onMeasureClick: (point: MeasurePoint) => void;
  onCloseActiveChain: () => void;
  onRemoveSegment: (chainId: number, segmentIndex: number) => void;
  onRemoveChain: (chainId: number) => void;
}

export default function SceneCanvas({
  parentLods,
  resetVersion,
  placements,
  selectedId,
  mode,
  measureMode,
  snapEnabled,
  canEditPlacements,
  activePanorama,
  panoramas,
  onActivatePanorama,
  panoramaMove,
  showMarkers,
  calibrating,
  panoramaOpacity,
  cameraPositionRef,
  onPanoramaError,
  chains,
  activeChainId,
  unitRatio,
  onSelect,
  onCommit,
  onMeasureClick,
  onCloseActiveChain,
  onRemoveSegment,
  onRemoveChain,
}: SceneCanvasProps) {
  const handlePointerMissed = useCallback(() => {
    // In measure mode an empty-space click is just "no surface" — leave the
    // pending point alone. Otherwise treat empty clicks as deselect.
    if (!measureMode) onSelect(null);
  }, [measureMode, onSelect]);

  // Dedupe handle: R3F dispatches one synthetic event per raycast
  // intersection, but they all share the same DOM nativeEvent. We
  // process only the first event per native click; the rest are ignored.
  // (stopPropagation alone is not enough — separate intersection events
  // start with fresh `stopped` state and can still reach the wrapper.)
  const lastNativeRef = useRef<Event | null>(null);
  // Shared ref to the territory's outer group. PlacementsLayer points its
  // surface-snap raycaster at it; GltfModel forwards through to <group>.
  // Lives here (not in PlacementsLayer) so the two siblings can reach the
  // same Object3D without lifting state to ModelViewer.
  const territoryRef = useRef<Group>(null);
  // When a panorama is active, snap targets this mesh instead of the
  // territory GLB. Persisting both refs keeps the swap free of remounts.
  const panoramaRef = useRef<Mesh>(null);
  // PlacementsLayer's territoryRef is whatever surface snap should hit.
  // In panorama mode that's the sphere; otherwise the territory GLB.
  const snapTargetRef = activePanorama ? panoramaRef : territoryRef;

  // In panorama mode only the placements whose allowlist includes the active
  // panorama render — equipment dropped for one panorama no longer leaks into
  // the others. The 3D view (no active panorama) always shows every placement
  // so the editor can never lose one.
  const visiblePlacements = useMemo(
    () =>
      activePanorama
        ? placements.filter((p) =>
            p.visiblePanoramaIds.includes(activePanorama.id),
          )
        : placements,
    [placements, activePanorama],
  );

  // Wrapper-group click is the catch-all for in-scene measurement points.
  // Use the first intersection's world point — that's the surface the
  // user actually targeted, regardless of how many objects sit behind it.
  const handleSceneClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!measureMode) return;
      if (lastNativeRef.current === event.nativeEvent) return;
      lastNativeRef.current = event.nativeEvent;
      event.stopPropagation();
      const hit = event.intersections[0]?.point ?? event.point;
      onMeasureClick({ x: hit.x, y: hit.y, z: hit.z });
    },
    [measureMode, onMeasureClick],
  );

  // While dragging a panorama marker, project the cursor onto the territory
  // surface (first hit) and report it. Same point source as the measure
  // tool. Early-returns when not dragging so normal hovering pays nothing.
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!panoramaMove?.moveMode || panoramaMove.draggingId == null) return;
      const hit = event.intersections[0]?.point;
      if (!hit) return;
      event.stopPropagation();
      panoramaMove.move({ x: hit.x, y: hit.y, z: hit.z });
    },
    [panoramaMove],
  );

  return (
    <Canvas
      camera={CAMERA}
      gl={GL_CONFIG}
      dpr={DPR_RANGE}
      // frameloop="demand" turns off the always-on 60fps render loop.
      // R3F now renders only when invalidate() is called: on prop/state
      // changes, on Suspense resolution, and — for camera input — when
      // CameraRig fires an explicit invalidate at the end of a zoom or
      // drag. Mid-zoom frames are no longer drawn, which is what was
      // pegging the GPU on heavy KTX2 meshes.
      frameloop="demand"
      onPointerMissed={handlePointerMissed}
    >
      <color attach="background" args={BG_ARGS} />
      {/* Detect WebGL compressed-texture support before any GLB parses,
          so KTX2 transcoding hits GPU formats instead of RGBA8. */}
      <Ktx2Init />
      {/* Warm useGLTF's cache only after Ktx2Init has configured the
          loader — preloading from outside Canvas would race the KTX2
          setup and corrupt texture decoding. */}
      <GlbPreloader parentLods={parentLods} placements={placements} />
      <Lighting />

      {/* Always wire the click handler — handleSceneClick early-returns when
          measureMode is off. Toggling between defined/undefined would force
          the group to re-attach DOM listeners on every mode change. */}
      <group onClick={handleSceneClick} onPointerMove={handlePointerMove}>
        {/* `observe` would re-fit the camera every time <Detailed> swaps
            an LOD child (its bbox change is what observe watches). That
            fights OrbitControls during a wheel zoom and reads as a freeze
            at every LOD threshold. We fit once on mount via `fit` and
            route explicit resets through CameraRig/resetVersion. */}
        {/* Territory mesh hides while a panorama is active — the sphere
            replaces it as the visible scene. The ref stays mounted via
            `visible=false` so subsequent toggles avoid re-loading the
            GLB. Bounds only auto-fits on initial mount; that fit stays
            valid across panorama toggles. */}
        <Bounds fit clip margin={1.2}>
          <group visible={!activePanorama || calibrating}>
            <GltfModel lods={parentLods} raycastable={measureMode || panoramaMove?.draggingId != null} groupRef={territoryRef} />
          </group>
        </Bounds>

        <PanoramaSceneLayer
          activePanorama={activePanorama}
          panoramaRef={panoramaRef}
          calibrating={calibrating}
          panoramaOpacity={panoramaOpacity}
          onPanoramaError={onPanoramaError}
          panoramas={panoramas}
          onActivatePanorama={onActivatePanorama}
          showMarkers={showMarkers}
          measureMode={measureMode}
          move={panoramaMove}
        />

        <Suspense fallback={null}>
          <PlacementsLayer
            placements={visiblePlacements}
            selectedId={selectedId}
            mode={mode}
            measureMode={measureMode}
            canEdit={canEditPlacements}
            territoryRef={snapTargetRef}
            snapEnabled={snapEnabled}
            onSelect={onSelect}
            onCommit={onCommit}
          />
        </Suspense>
      </group>

      <MeasurementLayer
        chains={chains}
        activeChainId={activeChainId}
        unitRatio={unitRatio}
        onCloseActive={onCloseActiveChain}
        onRemoveSegment={onRemoveSegment}
        onRemoveChain={onRemoveChain}
      />

      <CameraRig resetVersion={resetVersion} />
      <CameraPositionTracker positionRef={cameraPositionRef} />
      <gridHelper args={GRID_ARGS} position={GRID_POSITION} />
      {/* Drop DPR while the user is interacting (camera drag, gizmo drag)
          and restore it on idle — keeps frame rate up on weaker GPUs. */}
      <AdaptiveDpr pixelated />
    </Canvas>
  );
}
