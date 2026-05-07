import { assetUrl } from "@/shared/infrastructure/asset-url";
import { pickLod, type LodArtifact } from "@/shared/domain/lod-artifact";

// pickLodUrl composes the domain pickLod helper with the infrastructure
// assetUrl builder. Returns null when the chain is empty.
export function pickLodUrl(
  chain: LodArtifact[],
  preferred = 0,
): string | null {
  const lod = pickLod(chain, preferred);
  return lod ? assetUrl(lod.hash) : null;
}

// lodUrl resolves a single LOD artifact to its GLB URL. Used by callers
// that already have a specific LOD (error-boundary retry, preloader).
export function lodUrl(lod: LodArtifact): string {
  return assetUrl(lod.hash);
}
