import {
  memo,
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { Group, Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
import { useProgressiveLod } from "@/viewer/application/use-progressive-lod";
import LodWarmer from "@/viewer/presentation/three/lod-warmer";
import LodErrorBoundary from "@/viewer/presentation/three/lod-error-boundary";

interface PlacementInstanceProps {
  placement: ResolvedPlacement;
  selected: boolean;
  // measureMode disables this instance's click-to-select so the click bubbles
  // up to the canvas-level measure handler.
  measureMode: boolean;
  onSelect: (id: number) => void;
  ref?: Ref<Object3D>;
}

// PlacementInstance owns the in-scene representation of a single placement.
// The transform is applied imperatively (useLayoutEffect on the group's ref)
// rather than via JSX props because TransformControls mutates the object
// directly during a drag — keeping React as the only writer would let
// re-renders elsewhere stomp on the gizmo's in-flight mutations. The
// forwarded ref lets the parent attach <TransformControls> when this
// placement is the selected one.
//
// The LOD is progressive, same as the territory: the coarsest level mounts
// first so a scene full of placements paints quickly, then each upgrades to
// LOD0. Sitting on the coarsest level permanently used to be acceptable when
// lower LODs kept full-resolution textures; they no longer do, so a placed
// asset would stay visibly blurry up close.
function PlacementInstanceImpl({
  placement,
  selected,
  measureMode,
  onSelect,
  ref,
}: PlacementInstanceProps) {
  const { url, warmUrl, onWarmReady, onFailed } = useProgressiveLod(placement.lods, 0);
  if (!url) return null;

  return (
    <>
      <LodErrorBoundary resetKey={url} onError={onFailed}>
        <PlacementBody
          ref={ref}
          placement={placement}
          url={url}
          selected={selected}
          measureMode={measureMode}
          onSelect={onSelect}
        />
      </LodErrorBoundary>
      {warmUrl && <LodWarmer url={warmUrl} onReady={onWarmReady} />}
    </>
  );
}

// memo lets a re-render of PlacementsLayer (mode flip, measure toggle,
// unrelated CRUD) skip past every mounted placement whose props haven't
// changed.
const PlacementInstance = memo(PlacementInstanceImpl);
export default PlacementInstance;

interface PlacementBodyProps {
  placement: ResolvedPlacement;
  url: string;
  selected: boolean;
  measureMode: boolean;
  onSelect: (id: number) => void;
  ref?: Ref<Object3D>;
}

function PlacementBody({
  placement,
  url,
  measureMode,
  onSelect,
  ref,
}: PlacementBodyProps) {
  const { scene } = useGLTF(url, true, true, extendGltfLoader);
  // SkeletonUtils.clone keeps SkinnedMesh / Bone refs intact for skinned
  // assets and behaves like Object3D.clone for static ones. The clone is
  // memoized per source scene so re-renders don't churn the GPU buffers.
  // We also zero the clone's own root transform: some converters
  // (gltfpack in particular) leave a non-identity translation/rotation
  // on the GLB root node, which would otherwise drift the visible mesh
  // away from the wrapper group origin once the placement is scaled.
  const cloned = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    c.scale.set(1, 1, 1);
    return c;
  }, [scene]);
  const groupRef = useRef<Group>(null);
  useImperativeHandle(ref, () => groupRef.current as Object3D, []);

  // Apply position/rotation/scale imperatively whenever the source
  // placement changes (form save, server reconcile, etc.). During a gizmo
  // drag the placement object reference is stable — TransformControls
  // mutates the same Object3D, no setState is fired, and React doesn't
  // re-run this effect, so the gizmo wins.
  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(placement.position.x, placement.position.y, placement.position.z);
    g.rotation.set(placement.rotation.x, placement.rotation.y, placement.rotation.z);
    g.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
  }, [placement]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      // In measure mode the wrapper-group click handler higher up captures
      // the world point — yield to it instead of selecting.
      if (measureMode) return;
      // Stop propagation so the Canvas-level onPointerMissed does NOT also
      // fire and immediately deselect what we just selected.
      event.stopPropagation();
      onSelect(placement.id);
    },
    [measureMode, onSelect, placement.id],
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // In measure mode hover events shouldn't be eaten — let the cursor
      // hint feel consistent across parent + placements.
      if (!measureMode) e.stopPropagation();
    },
    [measureMode],
  );

  return (
    <group
      ref={groupRef}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
    >
      <primitive object={cloned} />
    </group>
  );
}
