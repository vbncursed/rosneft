import type { components } from "@/shared/api/dto";
import type { Placement } from "../model/placement";

type PlacementDto = components["schemas"]["Placement"];

/**
 * The one DTO→domain mapper for a placement. Both the scene bundle and the
 * placements gateway answer the same shape, so they read it the same way.
 */
export const toPlacement = (d: PlacementDto): Placement => ({
  id: d.id,
  territorySlug: d.territorySlug,
  modelSlug: d.modelSlug,
  position: d.position,
  rotation: d.rotation,
  scale: d.scale,
  label: d.label ?? "",
  updatedAt: d.updatedAt ?? "",
  visiblePanoramaIds: d.visiblePanoramaIds ?? [],
});
