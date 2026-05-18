"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Job } from "@/shared/domain/job";
import { runChunkedUpload } from "@/upload/application/run-chunked-upload";
import { notify } from "@/shared/presentation/toast/use-toast";
import {
  deriveSlug,
  deriveTitle,
  type BatchRow,
} from "@/upload/domain/batch-row";
import BatchRowView from "@/upload/presentation/components/batch-row";

interface BatchUploadFormProps {
  kind: "Model" | "Territory";
  create: (body: {
    slug: string;
    title: string;
    sourceBlobHash: string;
  }) => Promise<{ slug: string; job: Job }>;
  redirectBase: string;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function makeRow(file: File): BatchRow {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    slug: deriveSlug(file.name),
    title: deriveTitle(file.name),
    status: "idle",
    progress: 0,
  };
}

export default function BatchUploadForm({
  kind,
  create,
  redirectBase,
}: BatchUploadFormProps) {
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const updateRow = useCallback(
    (id: string, patch: Partial<BatchRow>) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [],
  );

  const onPick = useCallback((files: FileList | null) => {
    if (!files) return;
    setRows((prev) => [...prev, ...Array.from(files).map(makeRow)]);
  }, []);

  const onSlug = useCallback(
    (id: string, value: string) => updateRow(id, { slug: value }),
    [updateRow],
  );
  const onTitle = useCallback(
    (id: string, value: string) => updateRow(id, { title: value }),
    [updateRow],
  );
  const onRemove = useCallback(
    (id: string) => setRows((prev) => prev.filter((r) => r.id !== id)),
    [],
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting || rows.length === 0) return;
      const queue = rows.filter((r) => r.status !== "done");
      if (queue.some((r) => !SLUG_RE.test(r.slug) || !r.title.trim())) return;
      setSubmitting(true);
      let lastSlug: string | null = null;
      let lastJob: Job | null = null;
      for (const row of queue) {
        try {
          const blob = await runChunkedUpload(row.file, {
            onStage: (s) =>
              updateRow(row.id, {
                status: s === "finalizing" ? "finalizing" : "uploading",
              }),
            onProgress: (p) => updateRow(row.id, { progress: p }),
          });
          updateRow(row.id, { status: "creating", progress: 1 });
          const created = await create({
            slug: row.slug,
            title: row.title.trim(),
            sourceBlobHash: blob.hash,
          });
          updateRow(row.id, { status: "done" });
          lastSlug = created.slug;
          lastJob = created.job;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "failed";
          updateRow(row.id, { status: "failed", error: msg });
          notify.error(`${row.file.name}: ${msg}`);
        }
      }
      setSubmitting(false);
      // Single-file batch: jump straight to the converted entity so the
      // user can watch the SSE conversion screen. Multi-file: drop them
      // back to the list view to see everything queue up.
      if (queue.length === 1 && lastSlug && lastJob) {
        router.push(`${redirectBase}/${lastSlug}?jobId=${encodeURIComponent(lastJob.id)}`);
      } else if (lastSlug) {
        router.push(redirectBase);
      }
    },
    [submitting, rows, updateRow, create, redirectBase, router],
  );

  const allValid =
    rows.length > 0 &&
    rows.every((r) => r.status === "done" || (SLUG_RE.test(r.slug) && r.title.trim() !== ""));

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur"
    >
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Upload</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          New {kind.toLowerCase()}s
        </h1>
        <p className="text-sm leading-6 text-neutral-300">
          ZIP per entry: OBJ + MTL + textures. Slug and title autofill from the
          filename — edit before submitting. Resumable in 8 MB chunks.
        </p>
      </div>

      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-neutral-400">
          Archives
        </span>
        <input
          type="file"
          accept=".zip,application/zip"
          multiple
          onChange={(e) => onPick(e.target.files)}
          disabled={submitting}
          className="block w-full cursor-pointer rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-neutral-200 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-xs file:uppercase file:tracking-[0.2em] file:text-white disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>

      {rows.length > 0 ? (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <BatchRowView
              key={row.id}
              row={row}
              disabled={submitting}
              onSlug={onSlug}
              onTitle={onTitle}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!allValid || submitting}
          className="cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50"
        >
          {submitting
            ? "Uploading…"
            : rows.length > 1
              ? `Upload ${rows.length} ${kind.toLowerCase()}s`
              : `Upload ${kind.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
