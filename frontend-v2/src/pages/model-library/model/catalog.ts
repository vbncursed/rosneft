import {
  conversionStatusOf,
  lodLabel,
  totalSize,
  type Artifact,
} from "@/entities/content";
import { type ConversionStatus, type TargetJob } from "@/entities/conversion";
import { thumbnailUrl as urlOf, type Model } from "@/entities/model";
import { freeText, parseFilters } from "@/features/audit-filter";
import type { CatalogChip } from "@/shared/ui/catalog-card";
import { formatBytes } from "@/shared/lib/format-bytes";

export type ModelTab = "all" | "inUse" | "noImage";

export type ModelCardModel = {
  slug: string;
  title: string;
  status: ConversionStatus;
  thumbnailUrl: string | null;
  usageCount: number;
  chips: CatalogChip[];
  /** LOD levels present — not drawn on the card, only matched by `lod:`. */
  lods: string;
  trailing: { label: string; tone: "accent" | "muted" | "warn" | "bad" };
};

/** How the card reads at rest — usage wins whether it is in use or idle. */
const usageTrailing = (usageCount: number): ModelCardModel["trailing"] =>
  usageCount > 0
    ? { label: usageCount === 1 ? "in 1 territory" : `in ${usageCount} territories`, tone: "accent" }
    : { label: "unused", tone: "muted" };

/** A live or failed conversion overrides the usage-based reading outright. */
const TRAILING_OVERRIDE: Partial<Record<ConversionStatus, ModelCardModel["trailing"]>> = {
  converting: { label: "queued", tone: "warn" },
  failed: { label: "unavailable", tone: "bad" },
};

/** Maps a model plus its artifacts and (maybe) live job onto one catalog card. */
export function toModelCard(model: Model, artifacts: Artifact[], job?: TargetJob): ModelCardModel {
  const status = conversionStatusOf(artifacts.length > 0, job);

  return {
    slug: model.slug,
    title: model.title,
    status,
    thumbnailUrl: urlOf(model),
    usageCount: model.usageCount,
    chips: [{ label: artifacts.length > 0 ? formatBytes(totalSize(artifacts)) : "—", tone: "plain" }],
    lods: lodLabel(artifacts),
    trailing: TRAILING_OVERRIDE[status] ?? usageTrailing(model.usageCount),
  };
}

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
    if (key === "thumbnail") return (card.thumbnailUrl !== null) === (needle === "yes" || needle === "true");
    if (key === "used") return card.usageCount === Number(value);
    if (key === "lod") return card.lods.toLowerCase().includes(needle);
    return false;
  });
  if (!matchesFilters) return false;

  const text = freeText(query).trim().toLowerCase();
  if (!text) return true;
  return card.title.toLowerCase().includes(text) || card.slug.toLowerCase().includes(text);
}
