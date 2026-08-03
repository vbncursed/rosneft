import { Suspense, useLayoutEffect, type Ref } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group, Mesh } from "three";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
import { useProgressiveLod } from "@/viewer/application/use-progressive-lod";
import LodWarmer from "@/viewer/presentation/three/lod-warmer";
import LodErrorBoundary from "@/viewer/presentation/three/lod-error-boundary";

interface GltfModelProps {
  lods: LodArtifact[];
  // Raycastable toggles whether ray-mesh intersection is enabled on this
  // subtree. R3F's event system raycasts through the entire scene on
  // pointer/wheel events, and a triangle-rich territory mesh becomes a
  // ~100ms hot spot on every wheel tick. Measure tool flips this on when
  // the user actually needs surface picking; otherwise we no-op the
  // raycast and let the wheel handler stay cheap.
  raycastable: boolean;
  // Forwarded so other layers (placement snap-to-surface) can call the
  // mesh's original raycast directly without flipping the public flag.
  groupRef?: Ref<Group>;
}

// Three.Mesh.prototype.raycast iterates every triangle to find ray
// intersections. Replacing it with this no-op short-circuits the test
// without touching the underlying geometry.
const noopRaycast = () => undefined;

function GltfPrimitive({
  url,
  raycastable,
  groupRef,
}: {
  url: string;
  raycastable: boolean;
  groupRef?: Ref<Group>;
}) {
  // mesh-worker has already centered + scaled (max axis = 2) and
  // converted Z-up → Y-up, so we render the scene as-is. extendGltfLoader
  // wires up KTX2 transcoding; Draco is enabled via the second arg.
  const { scene } = useGLTF(url, true, true, extendGltfLoader);

  // The first time we see a mesh, stash its real raycast in userData so
  // any layer that needs surface intersection (placement snap, measure
  // tool, programmatic raycast) can invoke it even while raycastable is
  // false. After that we only swap m.raycast between noop and the cached
  // origRaycast — never overwrite userData.origRaycast again.
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      // Build a BVH once per geometry. acceleratedRaycast (set globally in
      // gltf-loader-setup.ts) reads geometry.boundsTree and falls back to
      // the stock per-triangle scan when absent, so this is the place that
      // unlocks ~100x faster raycasts on the territory mesh — vital for
      // per-frame snap-to-surface during a placement drag.
      if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();
      if (!m.userData.origRaycast) m.userData.origRaycast = m.raycast;
      const orig = m.userData.origRaycast as Mesh["raycast"];
      m.raycast = raycastable ? orig : noopRaycast;
    });
  }, [scene, raycastable]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

// GltfModel renders the territory progressively: the coarsest level in the
// chain mounts first so there is something on screen while LOD0 is still on
// the wire, then LOD0 replaces it.
//
// This is NOT drei's <Detailed>: the level on screen does not depend on camera
// distance. A territory is usually framed whole, so distance-based switching
// would leave it coarse forever, and the measure tool's raycast would land on
// different geometry depending on zoom.
export default function GltfModel({ lods, raycastable, groupRef }: GltfModelProps) {
  const { url, warmUrl, onWarmReady, onFailed } = useProgressiveLod(lods, 0);
  if (!url) return null;
  return (
    <>
      <LodErrorBoundary resetKey={url} onError={onFailed}>
        <Suspense fallback={null}>
          <GltfPrimitive url={url} raycastable={raycastable} groupRef={groupRef} />
        </Suspense>
      </LodErrorBoundary>
      {warmUrl && <LodWarmer url={warmUrl} onReady={onWarmReady} />}
    </>
  );
}
