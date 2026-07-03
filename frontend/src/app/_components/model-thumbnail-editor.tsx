"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runChunkedUpload } from "@/upload/application/run-chunked-upload";
import { updateModelThumbnail } from "@/model/infrastructure/model-gateway";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import { notify } from "@/shared/presentation/toast/use-toast";

interface ModelThumbnailEditorProps {
  slug: string;
  thumbnailBlobHash?: string;
  canWrite: boolean;
}

// ModelThumbnailEditor shows the model's current thumbnail and — for writers —
// lets them upload, replace, or remove it. The image is a plain content-
// addressed blob (uploaded via the chunked flow), referenced by hash on PATCH.
export default function ModelThumbnailEditor({
  slug,
  thumbnailBlobHash,
  canWrite,
}: ModelThumbnailEditorProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const url = thumbnailBlobHash ? assetUrl(thumbnailBlobHash) : undefined;

  const commit = async (hash: string, done: string) => {
    setBusy(true);
    try {
      await updateModelThumbnail(slug, hash);
      notify.success(done);
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const blob = await runChunkedUpload(file);
      await updateModelThumbnail(slug, blob.hash);
      notify.success("Thumbnail updated");
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Thumbnail</p>
      <div className="flex items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40 text-[10px] uppercase tracking-[0.18em] text-neutral-600">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Model thumbnail" className="size-full object-contain p-1" />
          ) : (
            "none"
          )}
        </div>

        {canWrite ? (
          <div className="flex flex-col items-start gap-2">
            <label
              className={`cursor-pointer rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 ${
                busy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {busy ? "Working…" : url ? "Replace image" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            {url ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => commit("", "Thumbnail removed")}
                className="cursor-pointer text-xs text-neutral-400 underline transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
