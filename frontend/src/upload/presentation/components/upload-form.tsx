"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useChunkedUpload } from "@/upload/application/use-chunked-upload";
import type { Job } from "@/shared/domain/job";
import Field from "@/upload/presentation/components/field";
import ProgressBar from "@/upload/presentation/components/progress-bar";
import { notify } from "@/shared/presentation/toast/use-toast";

interface UploadFormProps {
  kind: "Territory" | "Model";
  // create is the gateway call: createTerritory or createModel. Returns
  // the created entity slug + queued conversion job for SSE redirect.
  create: (body: {
    slug: string;
    title: string;
    description?: string;
    sourceBlobHash: string;
  }) => Promise<{ slug: string; job: Job }>;
  redirectBase: string; // e.g. "/territories"
  redirectAfter?: "list" | "detail";
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export default function UploadForm({
  kind,
  create,
  redirectBase,
  redirectAfter = "detail",
}: UploadFormProps) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { status, progress, upload, cancel } = useChunkedUpload();

  const valid = SLUG_RE.test(slug) && title.trim() !== "" && file !== null;

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!file || submitting) return;
      setSubmitting(true);
      try {
        const blob = await upload(file);
        if (!blob) return;
        const created = await create({
          slug,
          title: title.trim(),
          description: description.trim() || undefined,
          sourceBlobHash: blob.hash,
        });
        const target =
          redirectAfter === "detail"
            ? `${redirectBase}/${created.slug}?jobId=${encodeURIComponent(created.job.id)}`
            : "/";
        router.push(target);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setSubmitting(false);
      }
    },
    [create, description, file, redirectAfter, redirectBase, router, slug, submitting, title, upload],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur"
    >
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
          Upload
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          New {kind.toLowerCase()}
        </h1>
        <p className="text-sm leading-6 text-neutral-300">
          ZIP with OBJ + MTL + textures. Resumable on network drops —
          8 MB chunks.
        </p>
      </div>

      <Field
        label="Slug"
        hint="Latin letters, digits, hyphens. Used in the URL."
        value={slug}
        onChange={setSlug}
        required
      />
      <Field label="Title" value={title} onChange={setTitle} required />
      <Field
        label="Description"
        value={description}
        onChange={setDescription}
        multiline
      />

      <div>
        <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-neutral-400">
          Archive
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
          disabled={!valid || submitting}
          className="cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50"
        >
          {submitting ? "Uploading…" : "Upload and convert"}
        </button>
        {submitting ? (
          <button
            type="button"
            onClick={cancel}
            className="cursor-pointer rounded-full border border-white/20 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-white/[0.08]"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
