import { clsx as cx } from "clsx";
import { formatBytes } from "@/shared/lib/format-bytes";
import { Badge, type BadgeProps } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { TextField } from "@/shared/ui/text-field";
import { isBusy, type QueueRow, type RowStatus } from "../model/batch";

export type QueueRowProps = {
  row: QueueRow;
  onTitle: (title: string) => void;
  onRemove: () => void;
  onThumbnail: (file: File | null) => void;
};

const RAIL: Record<RowStatus, string> = {
  queued: "bg-line-2",
  uploading: "bg-accent",
  finalizing: "bg-accent",
  creating: "bg-accent",
  done: "bg-ok",
  failed: "bg-bad",
};

const CHIP_TONE: Record<RowStatus, NonNullable<BadgeProps["tone"]>> = {
  queued: "dim",
  uploading: "accent",
  finalizing: "accent",
  creating: "accent",
  done: "ok",
  failed: "bad",
};

/** One archive in the batch queue: thumbnail, editable title, status, and progress or error. */
export function QueueRowCard({ row, onTitle, onRemove, onThumbnail }: QueueRowProps) {
  const busy = isBusy(row.status);
  const locked = busy || row.status === "done";
  const border = row.status === "failed" ? "border-bad" : busy ? "border-accent-line" : "border-line";
  const bg = row.status === "failed" ? "bg-bad-soft" : busy ? "bg-accent-soft" : "bg-panel";

  return (
    <article
      className={cx(
        "relative overflow-hidden rounded-[11px] border py-[13px] pr-[15px] pl-[18px]",
        border,
        bg,
        row.status === "done" && "opacity-[0.72]",
      )}
    >
      <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-[3px]", RAIL[row.status])} />

      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-line-2 bg-panel-2">
          <Icon name="cube" size={20} className={row.status === "failed" ? "text-bad" : "text-muted"} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-mono text-[11px] text-muted">{row.file.name}</p>
          <TextField
            aria-label={`Title for ${row.file.name}`}
            value={row.title}
            disabled={locked}
            onChange={(e) => onTitle(e.target.value)}
            className="mt-1 text-[13px]"
          />
        </div>

        <Badge tone={CHIP_TONE[row.status]} shape="tag" size="sm" className="shrink-0 self-start">
          {row.status}
        </Badge>

        <Button
          shape="icon"
          size="sm"
          variant="secondary"
          aria-label={`Remove ${row.file.name}`}
          disabled={busy}
          onClick={onRemove}
          className="shrink-0"
        >
          ×
        </Button>
      </div>

      {row.status === "uploading" ? (
        <div className="mt-2.5 flex items-center gap-2.5 pl-[44px]">
          <ProgressBar
            value={Math.round(row.progress * 100)}
            variant="thin"
            tone="accent"
            className="flex-1"
            ariaLabel={`${row.file.name} upload progress`}
          />
          <span className="shrink-0 font-mono text-[10px] text-accent">{Math.round(row.progress * 100)}%</span>
        </div>
      ) : null}

      {row.status === "failed" && row.error ? (
        <p className="mt-2 pl-[44px] font-mono text-[11px] text-bad">{row.error}</p>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <label className={cx("flex cursor-pointer items-center gap-1.5", locked && "pointer-events-none")}>
          <span
            className={cx(
              "font-mono text-[10px] tracking-[0.06em]",
              row.thumbnail ? "text-ok" : "text-muted",
            )}
          >
            {row.thumbnail ? "thumbnail · attached" : "thumbnail (optional) · add image"}
          </span>
          <input
            type="file"
            accept="image/*"
            aria-label={`Add thumbnail for ${row.title || row.file.name}`}
            className="sr-only"
            disabled={locked}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              onThumbnail(file);
            }}
          />
        </label>
        <span className="shrink-0 font-mono text-[10px] text-muted">{formatBytes(row.file.size)}</span>
      </div>
    </article>
  );
}
