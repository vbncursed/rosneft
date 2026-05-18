import { memo } from "react";
import type { BatchRow } from "@/upload/domain/batch-row";

interface BatchRowProps {
  row: BatchRow;
  disabled: boolean;
  onSlug: (id: string, value: string) => void;
  onTitle: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}

const statusLabel: Record<BatchRow["status"], string> = {
  idle: "queued",
  uploading: "uploading",
  finalizing: "finalizing",
  creating: "creating",
  done: "done",
  failed: "failed",
};

const statusTone: Record<BatchRow["status"], string> = {
  idle: "text-neutral-400",
  uploading: "text-cyan-200",
  finalizing: "text-cyan-200",
  creating: "text-cyan-200",
  done: "text-emerald-300",
  failed: "text-red-300",
};

function BatchRowImpl({ row, disabled, onSlug, onTitle, onRemove }: BatchRowProps) {
  const sizeMb = (row.file.size / 1024 / 1024).toFixed(1);
  const busy = row.status === "uploading" || row.status === "finalizing" || row.status === "creating";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs text-neutral-300">
          {row.file.name} <span className="text-neutral-500">· {sizeMb} MB</span>
        </p>
        <span className={`text-[10px] uppercase tracking-[0.18em] ${statusTone[row.status]}`}>
          {statusLabel[row.status]}
          {row.status === "uploading" ? ` ${Math.round(row.progress * 100)}%` : null}
        </span>
      </div>

      <div className="flex gap-2">
        <input
          value={row.slug}
          onChange={(e) => onSlug(row.id, e.target.value)}
          disabled={disabled || busy || row.status === "done"}
          placeholder="slug"
          className="w-32 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none transition-colors focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          value={row.title}
          onChange={(e) => onTitle(row.id, e.target.value)}
          disabled={disabled || busy || row.status === "done"}
          placeholder="title"
          className="flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm outline-none transition-colors focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => onRemove(row.id)}
          disabled={disabled || busy}
          aria-label="Remove from batch"
          className="cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 text-sm text-neutral-300 transition-colors hover:border-red-300/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ×
        </button>
      </div>

      {row.status === "uploading" ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-cyan-300 transition-[width] duration-150"
            style={{ width: `${Math.round(row.progress * 100)}%` }}
          />
        </div>
      ) : null}

      {row.error ? (
        <p className="text-[11px] text-red-200">{row.error}</p>
      ) : null}
    </div>
  );
}

export default memo(BatchRowImpl);
