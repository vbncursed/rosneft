import type { Project } from "@/catalog/domain/project";
import type { Artifact } from "@/catalog/domain/artifact";
import type { Placement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";

// SceneBundle is the single-shot payload returned by GET /projects/{slug}/scene.
// The gateway aggregates project + LOD0 artifact + placements + every other
// project as an asset option, so the viewer page can render with one round
// trip. `artifact` is absent when mesh-worker hasn't produced a LOD0 yet —
// presentation falls back to the conversion-pending screen.
export interface SceneBundle {
  project: Project;
  artifact: Artifact | null;
  placements: Placement[];
  assetOptions: PlacementAssetOption[];
}
