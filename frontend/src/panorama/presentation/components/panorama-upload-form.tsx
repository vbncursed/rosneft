"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChunkedUpload } from "@/upload/application/use-chunked-upload";
import Field from "@/upload/presentation/components/field";
import ProgressBar from "@/upload/presentation/components/progress-bar";
import { notify } from "@/shared/presentation/toast/use-toast";
import { isEquirectImageSignature } from "@/panorama/domain/image-signature";
import { createPanorama } from "@/panorama/infrastructure/panorama-gateway";

interface PanoramaUploadFormProps {
  territorySlug: string;
  territoryTitle: string;
}

// PanoramaUploadForm uploads an equirect JPG/PNG via the chunked-upload
// pipeline, then creates a Panorama anchored at the territory origin
// (0,0,0). Anchor + yaw are edited later from the placements panel.
export default function PanoramaUploadForm({
  territorySlug,
  territoryTitle,
}: PanoramaUploadFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { status, progress, upload, cancel } = useChunkedUpload();
  const territoryHref = `/territories/${encodeURIComponent(territorySlug)}`;

  // While the upload is in flight, "Cancel" aborts the AbortController
  // inside useChunkedUpload — the catch in `onSubmit` then sets the
  // form back to idle. Otherwise it just navigates back to the viewer.
  const onCancel = useCallback(() => {
    if (submitting) {
      cancel();
      return;
    }
    router.push(territoryHref);
  }, [cancel, router, submitting, territoryHref]);

  // Sniff the file's leading bytes on selection so a non-image (a ZIP
  // archive picked by mistake is the classic case) is rejected before it
  // ever reaches the upload pipeline — `accept` on the input is only a
  // hint the OS file dialog can ignore.
  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const selected = input.files?.[0] ?? null;
      if (!selected) {
        setFile(null);
        return;
      }
      const head = new Uint8Array(await selected.slice(0, 8).arrayBuffer());
      if (!isEquirectImageSignature(head)) {
        notify.error("Please choose an equirectangular JPG or PNG image.");
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
        await createPanorama(territorySlug, {
          title: title.trim(),
          sourceBlobHash: blob.hash,
        });
        notify.success("Panorama uploaded");
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
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
          Panorama
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Anchor a 360° capture to {territoryTitle}
        </h1>
        <p className="text-sm text-neutral-400">
          Equirectangular JPG or PNG from Insta360 Pro. Anchor and yaw can be
          adjusted from the viewer panel after upload.
        </p>
      </div>

      <Field
        label="Title"
        hint="A URL slug is generated from this automatically."
        value={title}
        onChange={setTitle}
        required
      />

      <div>
        <label className="block text-xs uppercase tracking-[0.2em] text-neutral-400">
          Equirect image *
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png"
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
          {submitting ? "Uploading…" : "Upload panorama"}
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
