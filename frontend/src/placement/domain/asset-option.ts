import type { LodArtifact } from "@/shared/domain/lod-artifact";

// PlacementAssetOption is the shrunken Model view used by the placement
// picker — slug + title for the dropdown plus the LOD chain so the
// renderer can pick whichever quality level it wants per placement.
// Empty `lods` means the model has no successful conversion yet; the
// picker greys it out.
export interface PlacementAssetOption {
  slug: string;
  title: string;
  lods: LodArtifact[];
}
