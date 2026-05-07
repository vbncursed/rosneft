import { Suspense, useMemo } from "react";
import { Detailed, useGLTF } from "@react-three/drei";
import { assetUrl } from "@/catalog/infrastructure/asset-url";
import type { LodArtifact } from "@/catalog/domain/lod-artifact";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";

interface GltfModelProps {
  lods: LodArtifact[];
}

// Distance thresholds for LOD switching. Calibrated for the converter's
// normalised scale (every model is rescaled to max-axis = 2 units), so
// "distance" here is camera-to-origin in world space:
//   ≤ 8   units → LOD0 (full quality, model fills the view)
//   8–18  units → LOD1 (~50% triangles, model is mid-distance)
//   ≥ 18  units → LOD2 (~25% triangles, far zoom)
// drei <Detailed> wraps three.js LOD: it picks the highest-index level
// whose distance threshold is ≤ the current camera distance.
const LOD_DISTANCES = [0, 8, 18];

function GltfPrimitive({ url }: { url: string }) {
  // mesh-worker has already centered + scaled (max axis = 2) and
  // converted Z-up → Y-up, so we render the scene as-is. extendGltfLoader
  // wires up KTX2 transcoding; Draco is enabled via the second arg.
  const { scene } = useGLTF(url, true, true, extendGltfLoader);
  return <primitive object={scene} />;
}

// GltfModel renders the parent project's GLB with distance-based LOD
// switching when the chain has more than one entry. Single-LOD chains
// (or one-LOD fallbacks built by the route) skip the LOD wrapper to
// avoid pointless overhead.
export default function GltfModel({ lods }: GltfModelProps) {
  // Defensive sort — backend already returns chains sorted ascending,
  // but pinning the order here makes the LOD level → distance mapping
  // immune to backend churn.
  const sorted = useMemo(
    () => [...lods].sort((a, b) => a.lod - b.lod),
    [lods],
  );

  if (sorted.length === 0) return null;

  if (sorted.length === 1) {
    return (
      <Suspense fallback={null}>
        <GltfPrimitive url={assetUrl(sorted[0].hash)} />
      </Suspense>
    );
  }

  // <Detailed> requires distances.length === children.length, so slice
  // the threshold table to whatever the chain actually carries.
  const distances = LOD_DISTANCES.slice(0, sorted.length);
  return (
    <Suspense fallback={null}>
      <Detailed distances={distances}>
        {sorted.map((entry) => (
          <GltfPrimitive key={entry.lod} url={assetUrl(entry.hash)} />
        ))}
      </Detailed>
    </Suspense>
  );
}
