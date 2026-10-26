import { UNGROUPED_TAG_SLUG, type ModelTag } from "@/entities/model-tag";
import type { Zone } from "./zone";

/** The models a zone may place: those tagged like the zone, never `ungrouped`, never the whole library. */
export function modelsForZone<T extends { tag: ModelTag }>(options: T[], zone: Zone): T[] {
  const wanted = new Set(zone.tags.map((t) => t.slug));
  wanted.delete(UNGROUPED_TAG_SLUG);
  return options.filter((o) => wanted.has(o.tag.slug));
}
