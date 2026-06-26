"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import type { Document } from "@/document/domain/document";

interface DocumentOverlayProps {
  document: Document;
  onClose: () => void;
}

// DocumentOverlay renders a PDF over the whole scene using the browser's
// built-in viewer via <iframe>. Esc or the ✕ button closes it; Download links
// straight to the blob.
//
// Portaled to <body>: the overlays panel that mounts this uses backdrop-blur,
// which makes it the containing block for position:fixed descendants — without
// the portal the "fullscreen" overlay would be clipped to the panel's box.
export default function DocumentOverlay({ document, onClose }: DocumentOverlayProps) {
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
    <div className="fixed inset-0 z-[1100] flex flex-col bg-black/80 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-neutral-100">
        <span className="min-w-0 flex-1 truncate font-medium">{document.title}</span>
        <a
          href={url}
          download
          className="shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
        >
          Download
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document"
          className="shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs transition-colors hover:bg-white/15"
        >
          ✕
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
