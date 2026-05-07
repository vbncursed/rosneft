import type { LodArtifact } from "@/catalog/domain/lod-artifact";

// PlacementAssetOption is the shrunken Project view used by the asset
// picker — slug + title for the dropdown plus the LOD chain so the
// renderer can pick whichever quality level it wants per placement.
// Empty `lods` means the asset has no successful conversion yet; the
// picker greys it out.
export interface PlacementAssetOption {
  slug: string;
  title: string;
  lods: LodArtifact[];
}
