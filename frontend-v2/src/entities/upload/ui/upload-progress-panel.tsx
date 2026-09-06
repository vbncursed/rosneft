import { Button } from "@/shared/ui/button";
import { ProgressBar } from "@/shared/ui/progress-bar";
import type { UploadProgressView } from "../model/progress-line";

export type UploadProgressPanelProps = {
  /** Bytes are moving (or the server is finalizing/creating): the submit shows its busy label and Cancel appears. */
  busy: boolean;
  progress?: UploadProgressView;
  /** Whether the idle submit may be pressed — irrelevant while busy. */
  canSubmit: boolean;
  submitLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  onSubmit: () => void;
  onCancel: () => void;
};

/** The bar-and-stats panel while bytes are moving, plus the submit/cancel row underneath. */
export function UploadProgressPanel({
  busy, progress, canSubmit, submitLabel, busyLabel = "Uploading…", cancelLabel = "Cancel", onSubmit, onCancel,
}: UploadProgressPanelProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {progress ? (
        <div className="flex flex-col gap-3.5 rounded-card border border-accent-line bg-panel px-[22px] py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[13px] font-semibold">Uploading</p>
            <p className="m-0 font-mono text-[11px] text-accent">{progress.header}</p>
          </div>
          <ProgressBar value={progress.value} tone="accent" ariaLabel="Upload progress" />
          <div className="flex flex-wrap gap-[18px] font-mono text-[10px] text-muted">
            {progress.stats.map((s) => <span key={s}>{s}</span>)}
          </div>
        </div>
      ) : null}
      <div className="flex gap-2.5">
        <Button variant="primary" loading={busy} disabled={!busy && !canSubmit} onClick={onSubmit}>
          {busy ? busyLabel : submitLabel}
        </Button>
        {busy ? <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button> : null}
      </div>
    </div>
  );
}
