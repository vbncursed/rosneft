import { conversionStatusOf, lodLabel, totalSize, type Artifact } from "@/entities/content";
import { isLive, stageLabel, type ConversionStatus, type TargetJob } from "@/entities/conversion";
import type { CatalogChip } from "@/shared/ui/catalog-card";
import { formatBytes } from "@/shared/lib/format-bytes";
import type { Territory } from "./territory";

export type TerritoryCardModel = {
  slug: string;
  title: string;
  description?: string;
  status: ConversionStatus;
  chips: CatalogChip[];
  progress?: { value: number; stage: string };
  trailing: { label: string; tone: "accent" | "muted" | "warn" | "bad" };
  /** Whether this territory has an external panorama tour — also filterable via `panorama:`. */
  panorama: boolean;
};

const TRAILING: Record<ConversionStatus, TerritoryCardModel["trailing"]> = {
  ready: { label: "Open →", tone: "accent" },
  converting: { label: "converting", tone: "muted" },
  failed: { label: "unavailable", tone: "muted" },
  pending: { label: "pending", tone: "muted" },
};

// A count is a fact, even at zero — only the size chip dashes for "nothing
// converted yet".
const placementChip = (count: number): CatalogChip => ({
  label: `${count} placement${count === 1 ? "" : "s"}`,
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
    panorama,
  };
}
