import {
  lodLabel,
  matchesFilters,
  matchesText,
  pipelineCounts,
  totalSize,
  type Artifact,
  type ContentItem,
  type ContentKind,
} from "@/entities/content";
import { freeText, parseFilters } from "@/features/audit-filter";
import { formatBytes } from "@/shared/lib/format-bytes";
import { shortDate } from "@/shared/lib/short-date";
import type { Detail } from "@/shared/ui/detail-list";
import type { ContentGroup } from "@/widgets/content-groups";
import type { ContentPageProps, ContentPageStat } from "../ui/content-page";

type Entity = { slug: string; title: string; updatedAt?: string };

/** A catalog row. Ready means converted; pending means nothing to show yet. */
export function toContentItem(
  kind: ContentKind,
  entity: Entity,
  artifacts: Artifact[],
): ContentItem {
  const date = shortDate(entity.updatedAt);
  const converted = artifacts.length > 0;
  return {
    kind,
    slug: entity.slug,
    title: entity.title,
    status: converted ? "ready" : "pending",
    meta: date ? `${entity.slug} · upd. ${date}` : entity.slug,
    lods: lodLabel(artifacts),
    size: converted ? formatBytes(totalSize(artifacts)) : "—",
  };
}

export const matchesContent = (item: ContentItem, query: string): boolean =>
  matchesFilters(item, parseFilters(query)) && matchesText(item, freeText(query));

const note = (items: ContentItem[]) => {
  const counts = pipelineCounts(items);
  return `${counts.ready} ready · ${counts.pending} pending`;
};

export function groupContent(items: ContentItem[]): ContentGroup[] {
  const territories = items.filter((i) => i.kind === "territory");
  const models = items.filter((i) => i.kind === "model");
  return [
    { key: "territories", label: "Territories", note: note(territories), items: territories },
    { key: "models", label: "Models", note: note(models), items: models },
  ];
}

export function pipelineOf(items: ContentItem[]): ContentPageProps["pipeline"] {
  const counts = pipelineCounts(items);
  return {
    label: "Conversion pipeline",
    detail: `${counts.ready} of ${items.length} ready`,
    segments: [
      { tone: "ok", value: counts.ready, label: "ready" },
      { tone: "neutral", value: counts.pending, label: "pending" },
      { tone: "warn", value: counts.converting, label: "converting" },
      { tone: "bad", value: counts.failed, label: "failed" },
    ],
  };
}

export function statsOf(items: ContentItem[], storageBytes: number): ContentPageStat[] {
  const territories = items.filter((i) => i.kind === "territory");
  const models = items.filter((i) => i.kind === "model");
  return [
    { label: "Territories", value: String(territories.length), hint: note(territories) },
    { label: "Models", value: String(models.length), hint: note(models) },
    {
      label: "Storage",
      value: formatBytes(storageBytes),
      hint: "GLB + KTX2 artifacts",
      tone: "accent",
    },
  ];
}

// Nothing there reads as dim rather than as a value, so a pending row does not
// print four confident zeroes.
const row = (label: string, value: string): Detail =>
  value === "—" || value === "0" ? { label, value, tone: "dim" } : { label, value };

export function inspectorDetails(
  item: ContentItem,
  artifacts: Artifact[],
  updatedAt: string | undefined,
): Detail[] {
  return [
    row("Artifacts", String(artifacts.length)),
    row("LODs", item.lods),
    row("Size", item.size),
    row("Updated", shortDate(updatedAt) ?? "—"),
  ];
}

/** The old SPA's upload forms; v2 has none. */
export const uploadHref = (kind: ContentKind): string =>
  kind === "territory" ? "/territories/new" : "/models/new";

/** Only a territory has a source-replace route. */
export const replaceHref = (item: ContentItem): string | null =>
  item.kind === "territory" ? `/territories/${encodeURIComponent(item.slug)}/replace` : null;
