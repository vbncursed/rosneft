import type { TerritoryCardModel } from "@/entities/territory";
import { freeText, parseFilters } from "@/features/audit-filter";

export type TerritoryTab = "all" | "ready" | "converting";

/** How many cards each tab would show — drawn beside its label. */
export function tabCounts(cards: TerritoryCardModel[]): Record<TerritoryTab, number> {
  return {
    all: cards.length,
    ready: cards.filter((c) => c.status === "ready").length,
    converting: cards.filter((c) => c.status === "converting").length,
  };
}

/**
 * Narrows the catalog by its tab, then by `key:value` filters and free text.
 * An unknown key matches nothing rather than everything — a silently ignored
 * typo would show the full list and look like the filter did nothing.
 */
export function matchesTerritory(card: TerritoryCardModel, tab: TerritoryTab, query: string): boolean {
  if (tab !== "all" && card.status !== tab) return false;

  const matchesFilters = parseFilters(query).every(({ key, value }) => {
    const needle = value.toLowerCase();
    if (key === "state") return card.status === needle;
    if (key === "panorama") return card.panorama === (needle === "yes" || needle === "true");
    return false;
  });
  if (!matchesFilters) return false;

  const text = freeText(query).trim().toLowerCase();
  if (!text) return true;
  return card.title.toLowerCase().includes(text) || card.slug.toLowerCase().includes(text);
}
