import { Suspense, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";
import LodErrorBoundary from "@/viewer/presentation/three/lod-error-boundary";

interface LodWarmerProps {
  url: string;
  onReady: () => void;
}

function Warm({ url, onReady }: LodWarmerProps) {
  // Suspends until the GLB is fetched and parsed. drei caches by URL, so the
  // component that swaps in afterwards gets a cache hit, not a second fetch.
  useGLTF(url, true, true, extendGltfLoader);
  useEffect(() => {
    onReady();
  }, [url, onReady]);
  return null;
}

// Swallowing the error is the point: if the high-quality level cannot load,
// the right outcome is to stay on the coarse one, which is already on screen
// and correct. That is the opposite of the boundary's other caller, which
// walks DOWN the chain on failure — here there is nowhere left to walk.
function stayOnCoarse() {
  return undefined;
}

// LodWarmer downloads a higher-quality LOD without putting it on screen. The
// caller keeps rendering the coarse level until onReady fires.
//
// ponytail: the coarse level stays in drei's cache after the swap, so a scene
// holds both levels in VRAM. Deliberate — the cache is keyed by URL and
// shared, so several placements of one model share a single entry, and
// clearing on unmount would pull the buffer out from under the others. If
// VRAM becomes the binding constraint, the upgrade path is a refcounted
// useGLTF.clear once every consumer of the coarse URL has let go.
export default function LodWarmer({ url, onReady }: LodWarmerProps) {
  return (
    <LodErrorBoundary resetKey={url} onError={stayOnCoarse}>
      <Suspense fallback={null}>
        <Warm url={url} onReady={onReady} />
      </Suspense>
    </LodErrorBoundary>
  );
}
