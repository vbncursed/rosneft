import type { ConversionStatus } from "@/entities/conversion";

export type ContentKind = "territory" | "model";

/**
 * One row of the catalog, whichever table it came from. Territories and models
 * differ in what they are for, not in how the catalog lists them.
 */
export type ContentItem = {
  kind: ContentKind;
  slug: string;
  title: string;
  status: ConversionStatus;
  /** Human-readable source size, or "—" while there is nothing converted. */
  size: string;
  /** LOD levels present, e.g. "0-2", or "—". */
  lods: string;
  /** Short date, e.g. "31.08". */
  updated: string;
  /** 0–100 while converting. */
  progress?: number;
  /** What the worker is doing, e.g. "Compressing textures…". */
  stage?: string;
  thumbnailUrl?: string;
};

/** Where the catalog links this item. */
export const contentPath = (item: ContentItem) =>
  item.kind === "territory" ? `/territories/${item.slug}` : `/models/${item.slug}`;

/** Only a finished conversion can be opened. */
export const isOpenable = (item: ContentItem) => item.status === "ready";

export type ContentTab = "all" | "territory" | "model";

/** Filters by tab and by a plain-text query over title and slug. */
export function filterContent(
  items: ContentItem[],
  tab: ContentTab,
  query: string,
): ContentItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (tab !== "all" && item.kind !== tab) return false;
    if (!needle) return true;
    return (
      item.title.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle)
    );
  });
}

/** How many of each kind, for the tab labels. */
export function countByKind(items: ContentItem[]) {
  return {
    all: items.length,
    territory: items.filter((i) => i.kind === "territory").length,
    model: items.filter((i) => i.kind === "model").length,
  };
}
