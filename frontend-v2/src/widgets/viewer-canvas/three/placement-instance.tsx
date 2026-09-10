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
import type { ResolvedPlacement } from "@/entities/placement";
import { useProgressiveLod } from "@/features/lod";
import { extendGltfLoader } from "./gltf-loader-setup";
import LodWarmer from "./lod-warmer";
import LodErrorBoundary from "./lod-error-boundary";

interface PlacementInstanceProps {
  placement: ResolvedPlacement;
  // measureMode disables this instance's click-to-select so the click bubbles
  // up to the canvas-level point handler.
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
//
// A level that throws here drops out of the chain and the next one takes its
// place — the old ladder, and the right answer for a placement: one broken
// asset among many is not worth an error card over the whole scene. The
// territory is the exception and holds its failure (see gltf-model.tsx).
function PlacementInstanceImpl({
  placement,
  measureMode,
  onSelect,
  ref,
}: PlacementInstanceProps) {
  const lod = useProgressiveLod(placement.chain, 0);
  if (!lod.url) return null;

  return (
    <>
      <LodErrorBoundary resetKey={lod.url} onError={lod.onShownDropped}>
        <PlacementBody
          ref={ref}
          placement={placement}
          url={lod.url}
          measureMode={measureMode}
          onSelect={onSelect}
        />
      </LodErrorBoundary>
      {lod.warmUrl ? <LodWarmer url={lod.warmUrl} onReady={lod.onWarmReady} /> : null}
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
  measureMode: boolean;
  onSelect: (id: number) => void;
  ref?: Ref<Object3D>;
}

function PlacementBody({ placement, url, measureMode, onSelect, ref }: PlacementBodyProps) {
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
  //
  // placementId is stamped here too: it is what boxOf reads to frame a
  // selection, and it must exist on the group the transform lives on.
  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.userData.placementId = placement.id;
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
    <group ref={groupRef} onClick={handleClick} onPointerOver={handlePointerOver}>
      <primitive object={cloned} />
    </group>
  );
}
