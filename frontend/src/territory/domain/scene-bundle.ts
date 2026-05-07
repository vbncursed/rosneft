import type { Territory } from "@/territory/domain/territory";
import type { Artifact } from "@/shared/domain/artifact";
import type { Placement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";

// SceneBundle is the single-shot payload returned by
// GET /api/territories/{slug}/scene. The gateway aggregates territory +
// LOD0 artifact + placements + every catalog model with its LOD chain so
// the viewer page can render with one round trip. `artifact` is absent
// when mesh-worker hasn't produced a LOD0 yet — presentation falls back
// to the conversion-pending screen.
export interface SceneBundle {
  territory: Territory;
  artifact: Artifact | null;
  placements: Placement[];
  modelOptions: PlacementAssetOption[];
}
