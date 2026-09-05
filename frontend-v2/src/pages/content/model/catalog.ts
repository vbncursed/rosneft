import { isLive, type TargetJob } from "@/entities/conversion";
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

/**
 * A catalog row. A live job says "converting" whatever the artifacts hold —
 * a replaced source keeps its old LODs on screen until the new ones land;
 * a failed job says so; otherwise the artifacts decide between ready and
 * pending. A succeeded job adds nothing the artifacts do not already say.
 */
export function toContentItem(
  kind: ContentKind,
  entity: Entity,
  artifacts: Artifact[],
  job?: TargetJob,
): ContentItem {
  const date = shortDate(entity.updatedAt);
  const converted = artifacts.length > 0;
  const base: ContentItem = {
    kind,
    slug: entity.slug,
    title: entity.title,
    status: converted ? "ready" : "pending",
    meta: date ? `${entity.slug} · upd. ${date}` : entity.slug,
    lods: lodLabel(artifacts),
    size: converted ? formatBytes(totalSize(artifacts)) : "—",
  };
  if (!job) return base;
  if (job.status === "failed") return { ...base, status: "failed" };
  if (!isLive(job)) return base;
  return {
    ...base,
    status: "converting",
    ...(job.progress === null ? {} : { progress: Math.round(job.progress * 100) }),
    ...(job.stage === null ? {} : { stage: job.stage }),
  };
}

/** Right of the "Conversion" overline: "62% · textures", or "queued" before the worker reports. */
export function conversionNoteOf(job: TargetJob): string | undefined {
  if (!isLive(job)) return undefined;
  if (job.progress === null && job.stage === null) return "queued";
  const parts = [job.progress === null ? null : `${Math.round(job.progress * 100)}%`, job.stage];
  return parts.filter((p) => p !== null).join(" · ");
}

export const matchesContent = (item: ContentItem, query: string): boolean =>
  matchesFilters(item, parseFilters(query)) && matchesText(item, freeText(query));

/**
 * Every state the group actually holds. A count of zero says nothing worth the
 * width, so only "ready" is unconditional — a group with no ready rows is a
 * fact the reader wants, and dropping it would leave some notes empty.
 */
const note = (items: ContentItem[]) => {
  const counts = pipelineCounts(items);
  return (["ready", "pending", "converting", "failed"] as const)
    .filter((state) => state === "ready" || counts[state] > 0)
    .map((state) => `${counts[state]} ${state}`)
    .join(" · ");
};

const NEEDS_ATTENTION = (item: ContentItem) =>
  item.status === "converting" || item.status === "failed";

const attentionNote = (items: ContentItem[]) => {
  const counts = pipelineCounts(items);
  return `${counts.converting} converting · ${counts.failed} failed`;
};

/**
 * Kind groups, with whatever is converting or failed lifted out of them into a
 * group of its own at the top. A failure four rows down a list of forty is a
 * failure nobody sees; the group is absent entirely when there is nothing in
 * it, so it never draws an empty frame.
 */
export function groupContent(items: ContentItem[]): ContentGroup[] {
  const attention = items.filter(NEEDS_ATTENTION);
  const rest = items.filter((i) => !NEEDS_ATTENTION(i));
  const territories = rest.filter((i) => i.kind === "territory");
  const models = rest.filter((i) => i.kind === "model");
  return [
    ...(attention.length > 0 ? [{ key: "attention", label: "Needs attention", note: attentionNote(attention), items: attention }] : []),
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
  job?: TargetJob,
): Detail[] {
  return [
    // The worker's sentence comes first: it is why the row is red, and the
    // counts below it are stale by definition.
    ...(job?.status === "failed" && job.errorMessage
      ? [{ label: "Error", value: job.errorMessage, tone: "bad" } as const]
      : []),
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
