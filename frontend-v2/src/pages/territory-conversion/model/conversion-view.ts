import { conversionStatusOf } from "@/entities/content";
import { stageLabel, type TargetJob } from "@/entities/conversion";
import type { Territory } from "@/entities/territory";

export type Phase = "queued" | "running" | "failed" | "ready";

/** What the page needs, whatever loaded it — the hook's ready state, or a fixture. */
export type TerritoryConversionPageProps = {
  territory: Territory;
  phase: Phase;
  /** The job on record, or null when nothing has been recorded for this territory. */
  job: TargetJob | null;
  hasLod0: boolean;
  /** Leaves for the viewer — the old app, for now. */
  onOpenViewer: () => void;
};

/** The catalogs' rule, then queued/running read off the job itself. */
export function phaseOf(hasLod0: boolean, job: TargetJob | undefined): Phase {
  const status = conversionStatusOf(hasLod0, job);
  if (status === "failed") return "failed";
  if (status === "converting") return job?.status === "running" ? "running" : "queued";
  return status === "ready" ? "ready" : "queued";
}

/** Only a finish watched from this page leaves for the viewer — never a mount that is already ready. */
export const shouldLeave = (prev: Phase | null, next: Phase): boolean =>
  next === "ready" && (prev === "queued" || prev === "running");

export function ledeOf(phase: Phase, { hasJob, hasLod0 }: { hasJob: boolean; hasLod0: boolean }): string {
  switch (phase) {
    case "queued":
      return hasJob
        ? "The archive is uploaded and the job is in the queue. Nothing has been reported yet, so there is no progress to show."
        : "The archive is uploaded, but no job has been recorded for it yet. The worker picks such territories up on its own within a few minutes.";
    case "running":
      return "The worker is turning your archive into the compact format the viewer loads. Heavy work happens on the server, not in this tab.";
    case "failed":
      return hasLod0
        ? "Conversion stopped, so the viewer has nothing new to open. The previous revision of this territory stays live."
        : "Conversion stopped, so the viewer has nothing to open.";
    case "ready":
      return "The artifacts are in place. The viewer is still the previous app, so opening it leaves this page.";
  }
}

export type StatusPill = { tone: "neutral" | "warn" | "bad" | "ok"; fill: "outline" | "soft"; label: string };

export const STATUS_PILL: Record<Phase, StatusPill> = {
  queued: { tone: "neutral", fill: "outline", label: "queued" },
  running: { tone: "warn", fill: "soft", label: "converting" },
  failed: { tone: "bad", fill: "soft", label: "failed" },
  ready: { tone: "ok", fill: "soft", label: "ready" },
};

export type ProgressCard = { title: string; detail: string; value?: number };

const WAITING: ProgressCard = { title: "Waiting for a worker", detail: "no progress reported" };

/** The progress card's row: the stage and the percent, or what is missing. */
export function progressCard(phase: "queued" | "running", job: TargetJob | null): ProgressCard {
  if (phase === "queued" || job === null) return WAITING;
  const title = job.stage === null ? "Starting" : stageLabel(job.stage);
  if (job.progress === null) return { title, detail: "no progress reported" };
  const value = Math.round(job.progress * 100);
  return { title, detail: `${value}%`, value };
}
