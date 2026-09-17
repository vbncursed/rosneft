import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { assetUrl } from "@/entities/content";
import { pickCoarsest, type LodArtifact } from "@/entities/scene";
import type { ResolvedPlacement } from "@/entities/placement";
import { extendGltfLoader } from "./gltf-loader-setup";

interface GlbPreloaderProps {
  parentLods: LodArtifact[];
  placements: ResolvedPlacement[];
}

// GlbPreloader warms drei's useGLTF cache for the level that actually mounts
// first — the coarsest one in each chain. LOD0 is deliberately NOT preloaded:
// LodWarmer fetches it as soon as the coarse level is on screen, and racing it
// here would put the two on the wire together and lose the point of showing
// something early.
//
// Critically, this lives INSIDE <Canvas> and AFTER <Ktx2Init>: a preload
// at module-top or in a parent component would parse cached GLBs in a
// microtask before the KTX2 transcoder is configured, silently failing
// every KHR_texture_basisu decode and rendering models white. The
// useEffect runs after the first render commit of Canvas's children, by
// which time Ktx2Init's render-time detectSupport has already configured
// the loader.
export default function GlbPreloader({ parentLods, placements }: GlbPreloaderProps) {
  useEffect(() => {
    const first = pickCoarsest(parentLods);
    if (first) {
      useGLTF.preload(assetUrl(first.hash), true, true, extendGltfLoader);
    }
    for (const p of placements) {
      const pick = pickCoarsest(p.chain);
      if (pick) {
        useGLTF.preload(assetUrl(pick.hash), true, true, extendGltfLoader);
      }
    }
  }, [parentLods, placements]);
  return null;
}
