import type { Artifact } from "@/entities/content";
import type { ConversionStatus } from "@/entities/conversion";
import { pickLod } from "@/entities/scene";
import { viewerError } from "@/features/lod";
import type { LodReport } from "@/widgets/viewer-canvas";

export const IDLE_REPORT: LodReport = { shown: null, target: null, percent: null, progressText: null, failure: null };

export type ViewportMessage = { title: string; body: string };

export type ViewportState =
  | { kind: "message"; message: ViewportMessage }
  | {
      kind: "canvas";
      /** Nothing drawn yet and nothing failed: the skeleton stands in. */
      loading: boolean;
      /** "LOD 2 → 0 · 6.1 / 9.8 MB" while a finer level streams behind the one on screen. */
      upgrade: string | null;
      /** The level on screen failed to load: the card names the file and offers Try again. */
      failure: { file: string; status: number | null } | null;
    };

const MESSAGES: Record<"unavailable" | ConversionStatus, ViewportMessage> = {
  unavailable: {
    title: "3D preview unavailable",
    body: "This browser could not start WebGL. Download the GLB to open the model elsewhere.",
  },
  converting: { title: "Converting", body: "The 3D preview opens here when the conversion finishes." },
  failed: { title: "Conversion failed", body: "There is nothing to preview. The reason is in the panel beside it." },
  pending: { title: "Not converted yet", body: "The 3D preview appears once the model is converted." },
  // ready implies artifacts, so this only reads if the two ever disagree.
  ready: { title: "Not converted yet", body: "The 3D preview appears once the model is converted." },
};

export function viewportState(input: {
  slug: string;
  status: ConversionStatus;
  artifacts: Artifact[];
  report: LodReport;
  unavailable: boolean;
}): ViewportState {
  const { slug, status, artifacts, report, unavailable } = input;
  if (unavailable) return { kind: "message", message: MESSAGES.unavailable };
  if (artifacts.length === 0) return { kind: "message", message: MESSAGES[status] };
  const target = report.target === null ? null : pickLod(artifacts, report.target);
  const error = report.shown === null ? viewerError(report.failure, artifacts, target, slug) : null;
  const streaming =
    report.shown !== null && report.target !== null && report.shown !== report.target && report.progressText !== null;
  return {
    kind: "canvas",
    loading: report.shown === null && error === null,
    upgrade: streaming && !error ? `LOD ${report.shown} → ${report.target} · ${report.progressText}` : null,
    failure: error ? { file: error.file, status: error.status } : null,
  };
}
