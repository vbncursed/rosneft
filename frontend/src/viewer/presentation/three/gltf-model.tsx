import { Suspense } from "react";
import { useGLTF } from "@react-three/drei";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import { pickLod, type LodArtifact } from "@/shared/domain/lod-artifact";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";

interface GltfModelProps {
  lods: LodArtifact[];
}

function GltfPrimitive({ url }: { url: string }) {
  // mesh-worker has already centered + scaled (max axis = 2) and
  // converted Z-up → Y-up, so we render the scene as-is. extendGltfLoader
  // wires up KTX2 transcoding; Draco is enabled via the second arg.
  const { scene } = useGLTF(url, true, true, extendGltfLoader);
  return <primitive object={scene} />;
}

// GltfModel renders the parent project's GLB at LOD0 only. We deliberately
// skip <Detailed>'s distance-based LOD switching: with one static mesh the
// camera can zoom freely without three.js doing any per-frame LOD update,
// and the GPU just redraws the same vertex/index buffers under a different
// view matrix. lower LODs in the chain are not loaded — the catalog still
// produces them, but the viewer ignores them.
export default function GltfModel({ lods }: GltfModelProps) {
  const top = pickLod(lods, 0);
  if (!top) return null;
  return (
    <Suspense fallback={null}>
      <GltfPrimitive url={assetUrl(top.hash)} />
    </Suspense>
  );
}
