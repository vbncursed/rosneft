"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChunkedUpload } from "@/upload/application/use-chunked-upload";
import ProgressBar from "@/upload/presentation/components/progress-bar";
import { notify } from "@/shared/presentation/toast/use-toast";
import { replaceTerritorySource } from "@/territory/infrastructure/territory-gateway";

interface ReplaceSourceFormProps {
  slug: string;
  title: string;
}

// ReplaceSourceForm uploads a new source ZIP for an existing territory and
// triggers a re-conversion. The territory keeps its identity, so every
// placed object stays anchored. On success it redirects to the viewer's
// conversion screen (?jobId) just like the create flow.
export default function ReplaceSourceForm({ slug, title }: ReplaceSourceFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { status, progress, upload, cancel } = useChunkedUpload();
  const territoryHref = `/territories/${encodeURIComponent(slug)}`;

  const onCancel = useCallback(() => {
    if (submitting) {
      cancel();
      return;
    }
    router.push(territoryHref);
  }, [cancel, router, submitting, territoryHref]);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!file || submitting) return;
      setSubmitting(true);
      try {
        const blob = await upload(file);
        if (!blob) return;
        const { job } = await replaceTerritorySource(slug, {
          sourceBlobHash: blob.hash,
        });
        router.push(`${territoryHref}?jobId=${encodeURIComponent(job.id)}`);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Replace failed");
      } finally {
        setSubmitting(false);
      }
    },
    [file, router, slug, submitting, territoryHref, upload],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur"
    >
      <Link
        href={territoryHref}
        className="-mb-2 inline-flex w-fit items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-400 transition-colors hover:text-cyan-200"
      >
        <span aria-hidden="true">←</span>
        <span>Back to {title}</span>
      </Link>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
          Replace source
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Swap the 3D source of {title}
        </h1>
        <p className="text-sm leading-6 text-neutral-300">
          Upload a new ZIP (OBJ + MTL + textures). The mesh re-converts in
          place — every placed object keeps its position. Use this for an
          updated scan of the same site.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-neutral-400">
          New archive
        </label>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-neutral-200 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-xs file:uppercase file:tracking-[0.2em] file:text-white"
        />
        {file ? (
          <p className="mt-2 text-xs text-neutral-400">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        ) : null}
      </div>

      <ProgressBar status={status} progress={progress} />

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!file || submitting}
          className="cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50"
        >
          {submitting ? "Uploading…" : "Replace and convert"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-full border border-white/20 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-white/[0.08]"
        >
          {submitting ? "Cancel upload" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
