"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChunkedUpload } from "@/upload/application/use-chunked-upload";
import Field from "@/upload/presentation/components/field";
import ProgressBar from "@/upload/presentation/components/progress-bar";
import { notify } from "@/shared/presentation/toast/use-toast";
import { isPdfSignature } from "@/document/domain/pdf-signature";
import { createDocument } from "@/document/infrastructure/document-gateway";

interface DocumentUploadFormProps {
  territorySlug: string;
  territoryTitle: string;
}

// DocumentUploadForm uploads a PDF via the chunked-upload pipeline, then
// attaches it to the territory. The server independently re-checks the %PDF
// magic bytes at finalize (contentType is application/pdf for .pdf files).
export default function DocumentUploadForm({ territorySlug, territoryTitle }: DocumentUploadFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { status, progress, upload, cancel } = useChunkedUpload();
  const territoryHref = `/territories/${encodeURIComponent(territorySlug)}`;

  const onCancel = useCallback(() => {
    if (submitting) {
      cancel();
      return;
    }
    router.push(territoryHref);
  }, [cancel, router, submitting, territoryHref]);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const selected = input.files?.[0] ?? null;
      if (!selected) {
        setFile(null);
        return;
      }
      const head = new Uint8Array(await selected.slice(0, 5).arrayBuffer());
      if (!isPdfSignature(head)) {
        notify.error("Please choose a PDF file.");
        input.value = "";
        setFile(null);
        return;
      }
      setFile(selected);
    },
    [],
  );

  const valid = title.trim() !== "" && file !== null;

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!file || submitting) return;
      setSubmitting(true);
      try {
        const blob = await upload(file);
        if (!blob) return;
        await createDocument(territorySlug, {
          title: title.trim(),
          sourceBlobHash: blob.hash,
        });
        notify.success("Document uploaded");
        router.push(territoryHref);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setSubmitting(false);
      }
    },
    [file, router, submitting, territoryHref, territorySlug, title, upload],
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
        <span>Back to {territoryTitle}</span>
      </Link>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Document</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Attach a PDF to {territoryTitle}
        </h1>
        <p className="text-sm text-neutral-400">
          The document opens in an overlay over the scene and can be downloaded.
        </p>
      </div>

      <Field label="Title" value={title} onChange={setTitle} required />

      <div>
        <label className="block text-xs uppercase tracking-[0.2em] text-neutral-400">PDF *</label>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={onFileChange}
          required
          className="mt-2 block w-full text-sm text-neutral-300 file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-neutral-900 hover:file:bg-cyan-200"
        />
      </div>

      <ProgressBar status={status} progress={progress} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!valid || submitting}
          className="cursor-pointer rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Uploading…" : "Upload document"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-full border border-white/20 bg-transparent px-5 py-3 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]"
        >
          {submitting ? "Cancel upload" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
