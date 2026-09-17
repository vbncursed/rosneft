import type { ConversionStage, StageState } from "@/entities/conversion";
import type { Territory } from "@/entities/territory";
import type { UploadProgressView } from "@/entities/upload";
import { formatBytes } from "@/shared/lib/format-bytes";
import { shortDate } from "@/shared/lib/short-date";
import type { ChecklistItem } from "@/shared/ui/checklist";
import type { Detail } from "@/shared/ui/detail-list";

export type ReplacePhase = "idle" | "picked" | "uploading" | "finalizing" | "replacing";

/** Busy from the first uploaded byte to the gateway's answer on the replace call. */
export const isBusy = (phase: ReplacePhase): boolean =>
  phase === "uploading" || phase === "finalizing" || phase === "replacing";

/** The file card's meta line: no hash yet (that only exists after finalize), no archive inspection. */
export const fileMeta = (file: File): string => `${formatBytes(file.size)} · ZIP`;

/** The API has no source filename, so the current card's bold line is the hash, shortened. */
export const shortHash = (hash: string): string => `sha256:${hash.slice(0, 4)}…${hash.slice(-4)}`;

type Stage = ConversionStage & { hint: string };

const BASE: { label: string; hint: string }[] = [
  { label: "Chunked upload", hint: "8 MB chunks, resumable" },
  { label: "Finalize blob", hint: "content hash written" },
  { label: "Parse OBJ + MTL", hint: "geometry and materials" },
  { label: "Rebuild LOD 0-2", hint: "replaces the old artifacts" },
  { label: "Swap in viewer", hint: "territory returns to ready" },
];

const PENDING_TIME = ["queued", "queued", "~1 min", "~3 min", "~10 s"];

/** Only the first two stages ever move on this page — the conversion pipeline runs after the redirect. */
function stageAt(index: number, phase: ReplacePhase, percent: number | null): { state: StageState; time: string } {
  if (index === 0) {
    if (phase === "uploading") return { state: "active", time: percent === null ? "running" : `${percent}%` };
    if (phase === "finalizing" || phase === "replacing") return { state: "done", time: "done" };
  }
  if (index === 1) {
    if (phase === "finalizing") return { state: "active", time: "running" };
    if (phase === "replacing") return { state: "done", time: "done" };
  }
  return { state: "pending", time: PENDING_TIME[index] ?? "queued" };
}

/** The five mocked stages, toned against the replace's own phase; the upload stage's time is the live percentage. */
export function stagesFor(phase: ReplacePhase, percent: number | null): Stage[] {
  return BASE.map((stage, i) => ({ ...stage, ...stageAt(i, phase, percent) }));
}

/** The aside's "what is preserved" card — static, unaffected by phase or file. */
export const PRESERVED: ChecklistItem[] = [
  { label: "Slug, title and description", ok: true },
  { label: "Territory access assignments", ok: true },
  { label: "Placed models and their coordinates", ok: true },
  { label: "Panorama tour link", ok: true },
  { label: "Old LOD artifacts — replaced by the new build", ok: false },
];

/** The current card's facts: size from the HEAD probe, uploaded from the territory's own createdAt. */
export function currentRows(territory: Territory, size: number | null): Detail[] {
  return [
    { label: "size", value: size === null ? "—" : formatBytes(size) },
    { label: "uploaded", value: shortDate(territory.createdAt) ?? "—" },
  ];
}

/** Sign and magnitude of the new file against the current size — "+"/"−" (U+2212), never a bare "-". */
function deltaValue(currentSize: number, newSize: number): string {
  const d = newSize - currentSize;
  const sign = d === 0 ? "±" : d > 0 ? "+" : "−";
  return `${sign}${formatBytes(Math.abs(d))}`;
}

/** The new card's facts: no delta row when the current size could not be read. */
export function newRows(file: File, currentSize: number | null): Detail[] {
  const rows: Detail[] = [
    { label: "size", value: formatBytes(file.size) },
    { label: "selected", value: "just now" },
  ];
  if (currentSize !== null) rows.push({ label: "delta", value: deltaValue(currentSize, file.size) });
  return rows;
}

export type ReplaceSourcePageProps = {
  territory: Territory;
  currentSize: number | null;
  phase: ReplacePhase;
  file: File | null;
  progress?: UploadProgressView;
  onFiles: (files: File[]) => void;
  onReplace: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** Whether the viewer holds territory:write — without it the whole body is replaced by a callout. */
  canReplace: boolean;
  stages: Stage[];
};
