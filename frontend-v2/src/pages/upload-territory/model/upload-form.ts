import type { ConversionStage, StageState } from "@/entities/conversion";
import { formatBytes } from "@/shared/lib/format-bytes";
import type { ChecklistItem } from "@/shared/ui/checklist";

export type UploadPhase = "idle" | "picked" | "uploading" | "finalizing" | "creating";

export type UploadForm = { title: string; description: string; panoramaUrl: string };

/**
 * The Upload button is live only once a file is picked and the title is not
 * blank. A type predicate on `file` — not just a boolean — so callers that
 * guard on it (the hook's `onSubmit`) keep `file` narrowed to `File` for the
 * upload call that follows, instead of re-checking it a second time.
 */
export const canSubmit = (phase: UploadPhase, file: File | null, form: UploadForm): file is File =>
  phase === "picked" && !!file && form.title.trim() !== "";

/** The file card's meta line: no hash yet (that only exists after finalize), no archive inspection. */
export const fileMeta = (file: File): string => `${formatBytes(file.size)} · ZIP`;

type Stage = ConversionStage & { hint: string };

const BASE: { label: string; hint: string }[] = [
  { label: "Chunked upload", hint: "8 MB chunks, resumable" },
  { label: "Finalize blob", hint: "content hash written" },
  { label: "Parse OBJ + MTL", hint: "geometry and materials" },
  { label: "Build LOD 0-2", hint: "three detail levels" },
  { label: "Compress textures", hint: "KTX2 artifacts" },
];

const PENDING_TIME = ["queued", "queued", "~1 min", "~2 min", "~1 min"];

/** Only the first two stages ever move on this page — the conversion pipeline runs after the redirect. */
function stageAt(index: number, phase: UploadPhase): { state: StageState; time: string } {
  if (index === 0) {
    if (phase === "uploading") return { state: "active", time: "running" };
    if (phase === "finalizing" || phase === "creating") return { state: "done", time: "done" };
  }
  if (index === 1) {
    if (phase === "finalizing") return { state: "active", time: "running" };
    if (phase === "creating") return { state: "done", time: "done" };
  }
  return { state: "pending", time: PENDING_TIME[index] ?? "queued" };
}

/** The five mocked stages, toned against the upload's own phase. */
export function stagesFor(phase: UploadPhase): Stage[] {
  return BASE.map((stage, i) => ({ ...stage, ...stageAt(i, phase) }));
}

/** The aside's "before you submit" card — static, unaffected by phase or file. */
export const ARCHIVE_CHECKLIST: ChecklistItem[] = [
  { label: "Single ZIP, no nested archives", ok: true },
  { label: "OBJ references its MTL by relative path", ok: true },
  { label: "Textures next to the OBJ, not absolute paths", ok: true },
  { label: "Metres as units — the viewer measures in metres", ok: false },
];
