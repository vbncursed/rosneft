import { isLive, type ConversionStatus, type TargetJob } from "@/entities/conversion";

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
  /** The mono line under the title — slug plus whatever else identifies it. */
  meta: string;
  /** LOD levels present, e.g. "LOD 0-2", or "—". */
  lods: string;
  /** Human-readable artifact size, or "—" while there is nothing converted. */
  size: string;
  /** 0–100 while converting. */
  progress?: number;
  /** One word for what the worker is doing, e.g. "textures". */
  stage?: string;
};

/** Where the catalog links this item. */
export const contentPath = (item: ContentItem) =>
  `${item.kind === "territory" ? "/territories" : "/models"}/${encodeURIComponent(item.slug)}`;

/** Nothing converted yet — the design writes both columns as an em dash. */
export const hasArtifacts = (item: ContentItem) => item.lods !== "—";

/**
 * The status a job resolves to, ahead of whatever the artifacts alone say: a
 * live job says "converting" (unless it failed, which wins outright,
 * whatever is already converted); with no live job the artifacts decide
 * ready/pending, and a succeeded job adds nothing they do not already say.
 * Shared by every catalog that layers a conversion job onto its own
 * artifacts (Content, Territory) — kept here rather than in `conversion`
 * itself so that slice never has to import back from this one.
 */
export function conversionStatusOf(hasArtifacts: boolean, job?: TargetJob): ConversionStatus {
  const base: ConversionStatus = hasArtifacts ? "ready" : "pending";
  if (!job) return base;
  if (job.status === "failed") return "failed";
  return isLive(job) ? "converting" : base;
}

export type ContentFilter = { key: string; value: string };

/**
 * Narrows the catalog by `key:value` filters. An unknown key matches nothing
 * rather than everything: silently ignoring a typo would show a full list and
 * look like the filter simply did not work.
 */
export function matchesFilters(item: ContentItem, filters: ContentFilter[]): boolean {
  return filters.every(({ key, value }) => {
    const needle = value.toLowerCase();
    switch (key) {
      case "kind":
        return item.kind === needle;
      case "status":
        return item.status === needle;
      case "lod":
        return item.lods.toLowerCase().includes(needle);
      case "slug":
        return item.slug.toLowerCase().includes(needle);
      default:
        return false;
    }
  });
}

/** Free text matches the title, the slug or the meta line. */
export function matchesText(item: ContentItem, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return (
    item.title.toLowerCase().includes(needle) ||
    item.slug.toLowerCase().includes(needle) ||
    item.meta.toLowerCase().includes(needle)
  );
}

/** How the pipeline splits, for the coverage meter above the list. */
export function pipelineCounts(items: ContentItem[]) {
  return {
    ready: items.filter((i) => i.status === "ready").length,
    pending: items.filter((i) => i.status === "pending").length,
    converting: items.filter((i) => i.status === "converting").length,
    failed: items.filter((i) => i.status === "failed").length,
  };
}
