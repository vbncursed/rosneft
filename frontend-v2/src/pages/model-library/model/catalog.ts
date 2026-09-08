import type { ModelCardModel } from "@/entities/model";
import { freeText, parseFilters } from "@/features/audit-filter";

export type ModelTab = "all" | "inUse" | "noImage";

/** How many cards each tab would show — drawn beside its label. */
export function tabCounts(cards: ModelCardModel[]): Record<ModelTab, number> {
  return {
    all: cards.length,
    inUse: cards.filter((c) => c.usageCount > 0).length,
    noImage: cards.filter((c) => c.thumbnailUrl === null).length,
  };
}

/**
 * Narrows the library by its tab, then by `key:value` filters and free text.
 * An unknown key matches nothing rather than everything — a silently ignored
 * typo would show the full list and look like the filter did nothing.
 */
export function matchesModel(card: ModelCardModel, tab: ModelTab, query: string): boolean {
  if (tab === "inUse" && card.usageCount <= 0) return false;
  if (tab === "noImage" && card.thumbnailUrl !== null) return false;

  const matchesFilters = parseFilters(query).every(({ key, value }) => {
    const needle = value.toLowerCase();
    if (key === "thumbnail") {
      // Only "none" and "yes" are values this filter understands — anything
      // else (a stray "no" or "true") matches nothing, same convention as an
      // unknown key.
      if (needle === "none") return card.thumbnailUrl === null;
      if (needle === "yes") return card.thumbnailUrl !== null;
      return false;
    }
    if (key === "used") return card.usageCount === Number(value);
    if (key === "lod") return card.lods.toLowerCase().includes(needle);
    return false;
  });
  if (!matchesFilters) return false;

  const text = freeText(query).trim().toLowerCase();
  if (!text) return true;
  return card.title.toLowerCase().includes(text) || card.slug.toLowerCase().includes(text);
}
