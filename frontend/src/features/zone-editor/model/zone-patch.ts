import type { Zone } from "@/entities/zone";

export type ZonePatch = { title?: string; tagSlugs?: string[] };

/** What a saved zone's PATCH must carry to become the form's values: only the fields that differ, or null when none does. */
export function zonePatch(zone: Pick<Zone, "title" | "tags">, title: string, tagSlugs: string[]): ZonePatch | null {
  const trimmed = title.trim();
  const current = new Set(zone.tags.map((t) => t.slug));
  const sameTags = tagSlugs.length === current.size && tagSlugs.every((s) => current.has(s));
  const patch: ZonePatch = {
    ...(trimmed === zone.title ? {} : { title: trimmed }),
    ...(sameTags ? {} : { tagSlugs }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}
