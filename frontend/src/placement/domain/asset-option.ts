import type { LodArtifact } from "@/shared/domain/lod-artifact";
import type { Vec3 } from "@/shared/domain/vec3";

// PlacementAssetOption is the shrunken Model view used by the placement
// picker — slug + title for the dropdown plus the LOD chain so the
// renderer can pick whichever quality level it wants per placement.
// Empty `lods` means the model has no successful conversion yet; the
// picker greys it out. bboxMin/Max carry the original source-mesh
// bounds so a freshly-placed model can be sized relative to the
// territory's real-world dimensions.
export interface PlacementAssetOption {
  slug: string;
  title: string;
  // Ready-to-use image URL for the picker thumbnail; undefined = no thumbnail
  // (the picker shows a placeholder). Resolved from the model's blob hash.
  thumbnailUrl?: string;
  bboxMin?: Vec3;
  bboxMax?: Vec3;
  lods: LodArtifact[];
}
