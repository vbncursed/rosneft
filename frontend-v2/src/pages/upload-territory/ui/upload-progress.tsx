import { Button } from "@/shared/ui/button";
import { ProgressBar } from "@/shared/ui/progress-bar";
import type { UploadPhase } from "../model/upload-form";

export type UploadProgressPanelProps = {
  phase: UploadPhase;
  progress?: { value: number; header: string; stats: string[] };
  /** Whether the idle Upload button may be pressed — irrelevant while busy. */
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

const BUSY: UploadPhase[] = ["uploading", "finalizing", "creating"];

/** The bar-and-stats panel while bytes are moving, plus the submit/cancel row underneath. */
export function UploadProgressPanel({ phase, progress, canSubmit, onSubmit, onCancel }: UploadProgressPanelProps) {
  const busy = BUSY.includes(phase);

  return (
    <div className="flex flex-col gap-3.5">
      {progress ? (
        <div className="flex flex-col gap-3.5 rounded-card border border-accent-line bg-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[13px] font-semibold">Uploading</p>
            <p className="m-0 font-mono text-[11px] text-accent">{progress.header}</p>
          </div>
          <ProgressBar value={progress.value} tone="accent" ariaLabel="Upload progress" />
          <div className="flex flex-wrap gap-[18px] font-mono text-[10px] text-muted">
            {progress.stats.map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2.5">
        <Button variant="primary" loading={busy} disabled={!busy && !canSubmit} onClick={onSubmit}>
          {busy ? "Uploading…" : "Upload territory"}
        </Button>
        {busy ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
