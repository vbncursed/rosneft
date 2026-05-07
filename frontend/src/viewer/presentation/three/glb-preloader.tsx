import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import {
  orderByPreferred,
  pickLod,
  type LodArtifact,
} from "@/shared/domain/lod-artifact";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import { extendGltfLoader } from "@/viewer/presentation/three/gltf-loader-setup";

interface GlbPreloaderProps {
  parentLods: LodArtifact[];
  placements: ResolvedPlacement[];
}

// Match placement-instance.tsx — preload the LOD that will actually mount.
const PREFERRED_PLACEMENT_LOD = 2;

// GlbPreloader warms drei's useGLTF cache for the territory's LOD0 and
// each placement's chosen LOD. The viewer renders the territory at LOD0
// only (no distance-based swap), so lower LODs in the parent chain are
// intentionally not preloaded.
//
// Critically, this lives INSIDE <Canvas> and AFTER <Ktx2Init>: a preload
// at module-top or in a parent component would parse cached GLBs in a
// microtask before the KTX2 transcoder is configured, silently failing
// every KHR_texture_basisu decode and rendering models white. The
// useEffect runs after the first render commit of Canvas's children, by
// which time Ktx2Init's render-time detectSupport has already configured
// the loader.
export default function GlbPreloader({
  parentLods,
  placements,
}: GlbPreloaderProps) {
  useEffect(() => {
    const top = pickLod(parentLods, 0);
    if (top) {
      useGLTF.preload(assetUrl(top.hash), true, true, extendGltfLoader);
    }
    for (const p of placements) {
      const ranked = orderByPreferred(p.lods, PREFERRED_PLACEMENT_LOD);
      const pick = ranked[0];
      if (pick) {
        useGLTF.preload(assetUrl(pick.hash), true, true, extendGltfLoader);
      }
    }
  }, [parentLods, placements]);
  return null;
}
