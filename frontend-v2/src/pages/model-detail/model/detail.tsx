import type { ConversionStatus } from "@/entities/conversion";
import { assetUrl, totalSize, type Artifact } from "@/entities/content";
import type { Model } from "@/entities/model";
import { formatBytes } from "@/shared/lib/format-bytes";
import { shortDate } from "@/shared/lib/short-date";
import type { ArtifactRowProps } from "@/shared/ui/artifact-row";
import type { Detail } from "@/shared/ui/detail-list";
import { formatSize, groupDigits } from "@/widgets/viewer-panel";

/** What the page and its aside need, whatever loaded them — the hook's ready state, or a fixture. */
export type ModelDetailPageProps = {
  model: Model;
  status: ConversionStatus;
  artifacts: Artifact[];
  jobError: string | null;
  canDelete: boolean;
  canWrite: boolean;
  thumbnailBusy: boolean;
  onDelete: () => void;
  onThumbnail: (file: File) => void;
  onRemoveThumbnail: () => void;
};

export const shortHash = (hash: string) => `sha256:${hash.slice(0, 4)}…${hash.slice(-4)}`;
export const lod0 = (artifacts: Artifact[]) => artifacts.find((a) => a.lod === 0);
export const artifactFile = (slug: string, lod: number) => `${slug}-lod${lod}.glb`;
export const lodRange = (lod: number) => (lod === 0 ? "full detail" : lod === 1 ? "mid range" : "far range");

/** "valve-assembly · 3 LODs · 12 MB · created 02.09" — only the segments that exist. */
export function headerMeta(model: Model, artifacts: Artifact[]): string {
  const date = shortDate(model.createdAt);
  return [
    model.slug,
    ...(artifacts.length ? [`${artifacts.length} LODs`, formatBytes(totalSize(artifacts))] : []),
    ...(date ? [`created ${date}`] : []),
  ].join(" · ");
}

const bounds = (a: Artifact) =>
  formatSize({ x: a.bboxMax.x - a.bboxMin.x, y: a.bboxMax.y - a.bboxMin.y, z: a.bboxMax.z - a.bboxMin.z });

export function aboutRows(model: Model, artifacts: Artifact[]): Detail[] {
  const base = lod0(artifacts);
  return [
    { label: "slug", value: <span className="text-accent">{model.slug}</span> },
    ...(base
      ? [
          { label: "triangles", value: groupDigits(base.faces) },
          { label: "bounds", value: bounds(base) },
        ]
      : []),
    { label: "hash", value: shortHash(model.sourceBlobHash), tone: "muted" as const },
    model.usageCount > 0
      ? {
          label: "placed",
          value: `in ${model.usageCount} ${model.usageCount === 1 ? "territory" : "territories"}`,
          tone: "fg" as const,
        }
      : { label: "placed", value: "unused", tone: "muted" as const },
  ];
}

export function artifactRows(slug: string, artifacts: Artifact[]): ArtifactRowProps[] {
  return [...artifacts]
    .sort((a, b) => a.lod - b.lod)
    .map((a) => ({
      tag: `LOD ${a.lod}`,
      file: artifactFile(slug, a.lod),
      meta: `${groupDigits(a.faces)} tris · ${lodRange(a.lod)}`,
      size: formatBytes(a.size),
      href: assetUrl(a.hash),
    }));
}
