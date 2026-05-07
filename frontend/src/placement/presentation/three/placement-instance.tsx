import {
  memo,
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LodArtifact } from "@/catalog/domain/lod-artifact";
import type { Group, Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import { lodUrl } from "@/catalog/application/lod-url";
import { orderByPreferred } from "@/catalog/domain/lod-artifact";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
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

// Placements are typically small in screen space (overlay objects on a
// parent scene), so we ask for the coarsest LOD available — LOD2 on the
// default backend config. orderByPreferred returns the chain ranked by
// closeness to the requested LOD; the boundary walks the rank list when
// any entry fails to load.
const PREFERRED_PLACEMENT_LOD = 2;

// PlacementInstance owns the in-scene representation of a single placement.
// The transform is applied imperatively (useLayoutEffect on the group's ref)
// rather than via JSX props because TransformControls mutates the object
// directly during a drag — keeping React as the only writer would let
// re-renders elsewhere stomp on the gizmo's in-flight mutations. The
// forwarded ref lets the parent attach <TransformControls> when this
// placement is the selected one.
function PlacementInstanceImpl({
  placement,
  selected,
  measureMode,
  onSelect,
  ref,
}: PlacementInstanceProps) {
  const fallbackChain = useMemo(
    () => orderByPreferred(placement.lods, PREFERRED_PLACEMENT_LOD),
    [placement.lods],
  );
  // Reset the fallback index synchronously when the chain itself changes
  // (server returned different LOD hashes, or the placement was edited
  // to point at a different asset). React's "derived state from prop
  // change" pattern: setState during render is fine when it's gated by
  // a strict-equality compare, since the next render finds the state
  // already in sync.
  const [chainRef, setChainRef] = useState<LodArtifact[]>(fallbackChain);
  const [idx, setIdx] = useState(0);
  if (chainRef !== fallbackChain) {
    setChainRef(fallbackChain);
    setIdx(0);
  }

  if (fallbackChain.length === 0 || idx >= fallbackChain.length) return null;
  const url = lodUrl(fallbackChain[idx]);

  return (
    <LodErrorBoundary
      resetKey={url}
      onError={() => setIdx((i) => i + 1)}
    >
      <PlacementBody
        ref={ref}
        placement={placement}
        url={url}
        selected={selected}
        measureMode={measureMode}
        onSelect={onSelect}
      />
    </LodErrorBoundary>
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
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
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
