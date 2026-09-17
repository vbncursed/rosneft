import { conversionStatusOf, lodLabel, totalSize, type Artifact } from "@/entities/content";
import { type ConversionStatus, type TargetJob } from "@/entities/conversion";
import { formatBytes } from "@/shared/lib/format-bytes";
import { thumbnailUrl as urlOf, type Model } from "./model";

export type ModelCardModel = {
  slug: string;
  title: string;
  status: ConversionStatus;
  thumbnailUrl: string | null;
  usageCount: number;
  /** The footer's plain right-hand text — "—" only while nothing is converted. */
  size: string;
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
    size: artifacts.length > 0 ? formatBytes(totalSize(artifacts)) : "—",
    lods: lodLabel(artifacts),
    trailing: TRAILING_OVERRIDE[status] ?? usageTrailing(model.usageCount),
  };
}
