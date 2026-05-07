import { assetUrl } from "@/catalog/infrastructure/asset-url";
import { pickLod, type LodArtifact } from "@/catalog/domain/lod-artifact";

// pickLodUrl composes the domain pickLod helper with the infrastructure
// assetUrl builder. Presentation/application code that needs a single GLB
// URL (rather than a switching chain) calls this; it returns null when
// the chain is empty, matching the "no successful conversion" case.
export function pickLodUrl(
  chain: LodArtifact[],
  preferred = 0,
): string | null {
  const lod = pickLod(chain, preferred);
  return lod ? assetUrl(lod.hash) : null;
}

// lodUrl resolves a single LOD artifact to its GLB URL. Used by presentation
// code that walks a pre-ordered fallback chain (e.g. error-boundary retry)
// and needs URLs at specific indexes without re-running pickLod.
export function lodUrl(lod: LodArtifact): string {
  return assetUrl(lod.hash);
}
