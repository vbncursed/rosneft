"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import DeleteButton from "@/shared/presentation/components/delete-button";
import type { Document } from "@/document/domain/document";

interface DocumentViewProps {
  document: Document;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

// DocumentView shows the selected PDF in place of the scene using the browser's
// built-in viewer via <iframe>. It takes over the whole viewport (portaled to
// <body>, above the z-50 profile avatar) so the avatar and overlays panel don't
// bleed through; Exit (or Esc) returns to the 3D scene.
export default function DocumentView({ document, canDelete, onDelete, onClose }: DocumentViewProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof window === "undefined") return null;
  const url = assetUrl(document.sourceBlobHash);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950">
      <div className="flex items-center gap-3 px-4 py-2 text-sm text-neutral-100">
        <span className="min-w-0 flex-1 truncate font-medium">{document.title}</span>
        <a
          href={url}
          download
          className="shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
        >
          Download
        </a>
        {canDelete ? (
          <DeleteButton
            label={document.title}
            onDelete={onDelete}
            className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
          >
            Delete
          </DeleteButton>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
        >
          Exit
        </button>
      </div>
      <iframe
        title={document.title}
        src={url}
        className="min-h-0 flex-1 border-0 bg-neutral-900"
      />
    </div>,
    window.document.body,
  );
}
