import { Suspense, useCallback, useMemo, useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { AdaptiveDpr, Bounds } from "@react-three/drei";
import type { Group } from "three";
import type { SceneColors } from "../model/scene-colors";
import type { ViewerCanvasProps } from "../ui/props";
import CameraRig from "./camera-rig";
import CameraTracker from "./camera-tracker";
import FocusOn from "./focus-on";
import GlbPreloader from "./glb-preloader";
import GltfModel from "./gltf-model";
import Ktx2Init from "./ktx2-init";
import Lighting from "./lighting";
import MeasurementLayer from "./measurement-layer";
import PanoramaScene from "./panorama-scene";
import PlacementsLayer from "./placements-layer";

// Stable literal references so react-three-fiber doesn't tear down and
// recreate the gridHelper / background colour on every render of this
// component. R3F reconciles `args` by reference; new array literals each
// render trigger a dispose+reconstruct cycle for the underlying
// THREE.Object3D — which is why the two coloured ones are memoised on
// `colors` rather than written inline.
// near=0.1 (not 0.01) keeps the depth-buffer precision sane against
// far=500 — log2(500/0.1) fits a 24-bit depth buffer comfortably; 500/0.01
// invites Z-fighting on coplanar geometry without a measurable benefit
// at the converter's normalised scale (max-axis = 2).
const CAMERA = { position: [0, 0, 3] as [number, number, number], fov: 50, near: 0.1, far: 500 };
// Lower bound is intentionally below 1: AdaptiveDpr drops dpr toward the
// lower bound while the user is interacting. Half-resolution renders are
// ~4x cheaper per pixel and read fine for the few hundred ms of an active
// gesture; full quality is restored once the gesture ends.
const DPR_RANGE: [number, number] = [0.5, 1.5];
const GL_CONFIG = { antialias: true, alpha: false };
const GRID_POSITION: [number, number, number] = [0, -1.2, 0];

export type SceneCanvasProps = ViewerCanvasProps & { colors: SceneColors };

export default function SceneCanvas({
  parentLods,
  targetLod,
  retryVersion,
  resetVersion,
  placements,
  mode,
  selectedId,
  gizmo,
  snap,
  canWrite,
  chains,
  activeChainId,
  unitRatio,
  focusRequest,
  activePanorama,
  panoramaBitmap,
  panoramaStatus,
  panoramaProgress,
  panoramaOpacity,
  panoramas,
  showMarkers,
  markerLabels,
  move,
  cameraPositionRef,
  cameraYawRef,
  colors,
  onPick,
  onActivatePanorama,
  onMarkerGrab,
  onMarkerMove,
  onMarkerDrop,
  onTransformCommit,
  onMeasurePoint,
  onCloseActiveChain,
  onRemoveSegment,
  onRemoveChain,
  onLod,
}: SceneCanvasProps) {
  // Orbit is the only mode that edits a selection; every other mode is
  // picking points, so the gizmo hides and clicks reach the wrapper group.
  const pointMode = mode !== "orbit";

  const bgArgs = useMemo<[string]>(() => [colors.background], [colors.background]);
  const gridArgs = useMemo<[number, number, string, string]>(
    () => [6, 24, colors.grid, colors.grid],
    [colors.grid],
  );

  const handlePointerMissed = useCallback(() => {
    // While picking points an empty-space click is just "no surface" — leave
    // the pending point alone. Otherwise treat empty clicks as deselect.
    if (!pointMode) onPick(null);
  }, [pointMode, onPick]);

  // Dedupe handle: R3F dispatches one synthetic event per raycast
  // intersection, but they all share the same DOM nativeEvent. We
  // process only the first event per native click; the rest are ignored.
  // (stopPropagation alone is not enough — separate intersection events
  // start with fresh `stopped` state and can still reach the wrapper.)
  const lastNativeRef = useRef<Event | null>(null);
  // Shared ref to the territory's outer group: PlacementsLayer points its
  // surface-snap raycaster at it, and GltfModel forwards through to <group>.
  const territoryRef = useRef<Group>(null);
  // The scene wrapper, and what FocusOn frames from. It has to be this and not
  // the territory: <Bounds> renders a group of its own, so the territory's
  // parent is that group, and every placement hangs off the wrapper beside it.
  const wrapperRef = useRef<Group>(null);

  // Wrapper-group click is the catch-all for in-scene points. Use the first
  // intersection's world point — that's the surface the user actually
  // targeted, regardless of how many objects sit behind it.
  const handleSceneClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!pointMode) return;
      if (lastNativeRef.current === event.nativeEvent) return;
      lastNativeRef.current = event.nativeEvent;
      event.stopPropagation();
      const hit = event.intersections[0]?.point ?? event.point;
      onMeasurePoint({ x: hit.x, y: hit.y, z: hit.z });
    },
    [pointMode, onMeasurePoint],
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
      <color attach="background" args={bgArgs} />
      {/* Detect WebGL compressed-texture support before any GLB parses,
          so KTX2 transcoding hits GPU formats instead of RGBA8. */}
      <Ktx2Init />
      {/* Warm useGLTF's cache only after Ktx2Init has configured the
          loader — preloading from outside Canvas would race the KTX2
          setup and corrupt texture decoding. */}
      <GlbPreloader parentLods={parentLods} placements={placements} />
      <Lighting />

      {/* Always wire the click handler — handleSceneClick early-returns when
          the canvas is not picking points. Toggling between defined/undefined
          would force the group to re-attach DOM listeners on every mode
          change. */}
      <group ref={wrapperRef} onClick={handleSceneClick}>
        {/* `observe` would re-fit the camera every time an LOD swap changed
            the bbox, which fights OrbitControls during a wheel zoom and reads
            as a freeze. We fit once on mount via `fit`, route explicit resets
            through CameraRig/resetVersion, and refit to a selection through
            FocusOn. */}
        <Bounds fit clip margin={1.2}>
          {/* Inside a panorama the photograph IS the scene: the sphere encloses
              the whole territory, so every hill and tank between the anchor and
              the horizon would be drawn in front of it. Hidden, not unmounted —
              Bounds fits at mount only, the drag projection still needs the
              meshes, and calibration (opacity < 1) is the operator lining the
              photo up against the model, which has to be on screen for that. */}
          <group visible={!activePanorama || panoramaOpacity < 1}>
            <GltfModel
              lods={parentLods}
              targetLod={targetLod}
              retryVersion={retryVersion}
              // A marker drag projects the cursor onto the territory, which
              // needs the meshes hittable for the same reason point-picking does.
              raycastable={pointMode || move.active}
              groupRef={territoryRef}
              onReport={onLod}
            />
          </group>
          {/* A panorama pins the camera at its anchor; framing a placement
              from there would fight the rig and land nowhere useful. */}
          <FocusOn root={wrapperRef} request={activePanorama ? null : focusRequest} />
        </Bounds>

        <Suspense fallback={null}>
          <PlacementsLayer
            placements={placements}
            selectedId={selectedId}
            mode={gizmo}
            measureMode={pointMode}
            canEdit={canWrite}
            territoryRef={territoryRef}
            // Nothing to snap to inside a panorama: the territory is behind
            // the equirect and the reader cannot see where a drop landed.
            snapEnabled={snap && activePanorama === null}
            activePanoramaId={activePanorama?.id ?? null}
            markerLabels={markerLabels}
            showMarkers={showMarkers}
            onSelect={onPick}
            onCommit={onTransformCommit}
          />
        </Suspense>
      </group>

      <MeasurementLayer
        chains={chains}
        activeChainId={activeChainId}
        unitRatio={unitRatio}
        lineColor={colors.accent}
        onCloseActive={onCloseActiveChain}
        onRemoveSegment={onRemoveSegment}
        onRemoveChain={onRemoveChain}
      />

      {/* Above CameraRig on purpose: React runs sibling cleanups in tree
          order, and PanoramaRig has to put the controls back before CameraRig
          disposes them. Outside <Bounds> too — a radius-50 sphere would
          swallow the auto-fit. */}
      <PanoramaScene
        activePanorama={activePanorama}
        bitmap={panoramaBitmap}
        status={panoramaStatus}
        progress={panoramaProgress}
        opacity={panoramaOpacity}
        panoramas={panoramas}
        showMarkers={showMarkers}
        pointMode={pointMode}
        move={move}
        territoryRef={territoryRef}
        onActivate={onActivatePanorama}
        onGrab={onMarkerGrab}
        onMove={onMarkerMove}
        onDrop={onMarkerDrop}
      />
      {/* The panorama edit panel lives outside the Canvas and reads the live
          view through these refs when the operator captures one. */}
      <CameraTracker positionRef={cameraPositionRef} yawRef={cameraYawRef} />
      <CameraRig resetVersion={resetVersion} />
      {/* Inside a panorama the floor is the photograph; a grid drawn over it
          reads as a bug. */}
      {activePanorama ? null : <gridHelper args={gridArgs} position={GRID_POSITION} />}
      {/* Drop DPR while the user is interacting (camera drag, gizmo drag)
          and restore it on idle — keeps frame rate up on weaker GPUs. */}
      <AdaptiveDpr pixelated />
    </Canvas>
  );
}
