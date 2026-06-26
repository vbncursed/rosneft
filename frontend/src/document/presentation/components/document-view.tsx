"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import DeleteButton from "@/shared/presentation/components/delete-button";
import { usePipWindow } from "@/document/application/use-pip-window";
import type { Document } from "@/document/domain/document";

interface DocumentViewProps {
  document: Document;
  canDelete: boolean;
  // Full-screen takeover vs. floating picture-in-picture window. Lifted to the
  // parent because the 3D scene is only hidden (to spare the GPU) in full mode.
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

const BTN =
  "shrink-0 cursor-pointer rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-neutral-100 transition-colors hover:bg-white/15";

// DocumentView shows the selected PDF via pdf.js's self-hosted viewer (zoom,
// search, print, download, Layers sidebar). Two display modes:
//   • fullscreen — takes over the whole viewport (portaled above the avatar);
//   • PiP — a draggable, resizable mini-window so objects can be placed in the
//     live 3D scene while the PDF stays visible. "Hide" collapses it to a pill
//     without unmounting the iframe, so the PDF's zoom/page survive.
// Exit (or Esc) returns to the scene. `?file` is a same-origin relative URL.
export default function DocumentView({
  document,
  canDelete,
  fullscreen,
  onToggleFullscreen,
  onDelete,
  onClose,
}: DocumentViewProps) {
  const pip = usePipWindow();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof window === "undefined") return null;
  const file = encodeURIComponent(assetUrl(document.sourceBlobHash));
  const src = `/pdfjs/web/viewer.html?file=${file}`;

  const frame = fullscreen
    ? "inset-0"
    : "rounded-lg border border-white/10 shadow-2xl shadow-black/60 overflow-hidden";
  const style = fullscreen
    ? undefined
    : { left: pip.geo.x, top: pip.geo.y, width: pip.geo.w, height: pip.geo.h };

  return createPortal(
    <>
      <div
        className={`fixed z-[60] flex flex-col bg-neutral-950 ${frame} ${hidden ? "hidden" : ""}`}
        style={style}
      >
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-100">
          <span
            onPointerDown={fullscreen ? undefined : pip.startMove}
            className={`min-w-0 flex-1 truncate font-medium ${fullscreen ? "" : "cursor-move select-none"}`}
          >
            {document.title}
          </span>
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={BTN}
            title={fullscreen ? "Shrink to window" : "Expand to full screen"}
          >
            {fullscreen ? "Minimize" : "Expand"}
          </button>
          {!fullscreen ? (
            <button type="button" onClick={() => setHidden(true)} className={BTN}>
              Hide
            </button>
          ) : null}
          {canDelete ? (
            <DeleteButton label={document.title} onDelete={onDelete} className={BTN}>
              Delete
            </DeleteButton>
          ) : null}
          <button type="button" onClick={onClose} className={BTN}>
            Exit
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <iframe title={document.title} src={src} className="h-full w-full border-0 bg-neutral-900" />
          {/* While dragging, a pointer over the iframe steals the move events —
              this overlay keeps them in the parent document. */}
          {pip.dragging ? <div className="absolute inset-0" /> : null}
        </div>

        {!fullscreen ? (
          <div
            onPointerDown={pip.startResize}
            title="Resize"
            className="absolute right-0 bottom-0 h-4 w-4 cursor-se-resize border-r-2 border-b-2 border-white/30"
          />
        ) : null}
      </div>

      {hidden && !fullscreen ? (
        <button
          type="button"
          onClick={() => setHidden(false)}
          className="fixed bottom-4 left-4 z-[60] flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-neutral-900/90 px-4 py-2 text-xs text-neutral-100 shadow-lg backdrop-blur transition-colors hover:bg-neutral-800"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
            <path
              d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a0 0 0 0 1 0 0V3zM14 3v5h5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <span className="truncate max-w-[200px]">{document.title}</span>
        </button>
      ) : null}
    </>,
    window.document.body,
  );
}
