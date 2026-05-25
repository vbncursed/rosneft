import { Suspense, useLayoutEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group, Mesh } from "three";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import { pickLod, type LodArtifact } from "@/shared/domain/lod-artifact";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";

interface GltfModelProps {
  lods: LodArtifact[];
  // Raycastable toggles whether ray-mesh intersection is enabled on this
  // subtree. R3F's event system raycasts through the entire scene on
  // pointer/wheel events, and a triangle-rich territory mesh becomes a
  // ~100ms hot spot on every wheel tick. Measure tool flips this on when
  // the user actually needs surface picking; otherwise we no-op the
  // raycast and let the wheel handler stay cheap.
  raycastable: boolean;
}

// Three.Mesh.prototype.raycast iterates every triangle to find ray
// intersections. Replacing it with this no-op short-circuits the test
// without touching the underlying geometry.
const noopRaycast = () => undefined;

function GltfPrimitive({ url, raycastable }: { url: string; raycastable: boolean }) {
  // mesh-worker has already centered + scaled (max axis = 2) and
  // converted Z-up → Y-up, so we render the scene as-is. extendGltfLoader
  // wires up KTX2 transcoding; Draco is enabled via the second arg.
  const { scene } = useGLTF(url, true, true, extendGltfLoader);
  const groupRef = useRef<Group>(null);

  // Toggle per-mesh raycast functions instead of unmounting the subtree —
  // unmounting would tear down GPU buffers and re-allocate on every
  // measure-mode flip. We cache each mesh's original raycast so we can
  // restore it cleanly.
  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root) return;
    const originals = new Map<Mesh, Mesh["raycast"]>();
    root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        originals.set(m, m.raycast);
        m.raycast = raycastable ? originals.get(m)! : noopRaycast;
      }
    });
    return () => {
      for (const [m, orig] of originals) m.raycast = orig;
    };
  }, [scene, raycastable]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

// GltfModel renders the parent project's GLB at LOD0 only. We deliberately
// skip <Detailed>'s distance-based LOD switching: with one static mesh the
// camera can zoom freely without three.js doing any per-frame LOD update,
// and the GPU just redraws the same vertex/index buffers under a different
// view matrix. lower LODs in the chain are not loaded — the catalog still
// produces them, but the viewer ignores them.
export default function GltfModel({ lods, raycastable }: GltfModelProps) {
  const top = pickLod(lods, 0);
  if (!top) return null;
  return (
    <Suspense fallback={null}>
      <GltfPrimitive url={assetUrl(top.hash)} raycastable={raycastable} />
    </Suspense>
  );
}
