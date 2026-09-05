import { conversionStatusOf, lodLabel, totalSize, type Artifact } from "@/entities/content";
import { isLive, stageLabel, type ConversionStatus, type TargetJob } from "@/entities/conversion";
import type { Territory } from "@/entities/territory";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { CatalogChip } from "@/shared/ui/catalog-card";
import { formatBytes } from "@/shared/lib/format-bytes";

export type TerritoryTab = "all" | "ready" | "converting";

export type TerritoryCardModel = {
  slug: string;
  title: string;
  description?: string;
  status: ConversionStatus;
  chips: CatalogChip[];
  progress?: { value: number; stage: string };
  trailing: { label: string; tone: "accent" | "muted" | "warn" | "bad" };
  /** Only a ready territory can be opened in the viewer. */
  openable: boolean;
  /** Whether this territory has an external panorama tour — also filterable via `panorama:`. */
  panorama: boolean;
};

const TRAILING: Record<ConversionStatus, TerritoryCardModel["trailing"]> = {
  ready: { label: "Open →", tone: "accent" },
  converting: { label: "converting", tone: "muted" },
  failed: { label: "unavailable", tone: "muted" },
  pending: { label: "pending", tone: "muted" },
};

const placementChip = (count: number): CatalogChip => ({
  label: count > 0 ? `${count} placement${count === 1 ? "" : "s"}` : "—",
  tone: "plain",
});

const sizeChip = (artifacts: Artifact[]): CatalogChip => ({
  label: artifacts.length > 0 ? formatBytes(totalSize(artifacts)) : "—",
  tone: "plain",
});

/** Maps a territory plus its artifacts and (maybe) live job onto one catalog card. */
export function toTerritoryCard(
  t: Territory,
  artifacts: Artifact[],
  job?: TargetJob,
): TerritoryCardModel {
  const status = conversionStatusOf(artifacts.length > 0, job);
  const panorama = Boolean(t.externalPanoramaUrl);

  const chips: CatalogChip[] =
    status === "converting"
      ? [{ label: lodLabel(artifacts), tone: "warn" }, sizeChip(artifacts)]
      : [
          placementChip(t.placementCount),
          sizeChip(artifacts),
          ...(panorama ? [{ label: "panorama", tone: "ok" } as const] : []),
        ];

  return {
    slug: t.slug,
    title: t.title,
    description: t.description,
    status,
    chips,
    // Whenever the job is live the bar is drawn, best-effort: 0% before the
    // worker has reported anything reads as "queued", not as nothing to show.
    ...(job && isLive(job)
      ? { progress: { value: Math.round((job.progress ?? 0) * 100), stage: stageLabel(job.stage) } }
      : {}),
    trailing: TRAILING[status],
    openable: status === "ready",
    panorama,
  };
}

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
