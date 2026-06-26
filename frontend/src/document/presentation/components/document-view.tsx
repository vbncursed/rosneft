"use client";

import { assetUrl } from "@/shared/infrastructure/asset-url";
import DeleteButton from "@/shared/presentation/components/delete-button";
import type { Document } from "@/document/domain/document";

interface DocumentViewProps {
  document: Document;
  canDelete: boolean;
  onDelete: () => Promise<void>;
}

// DocumentView renders the selected PDF in place of the 3D scene using the
// browser's built-in viewer via <iframe>. It fills the viewer container
// (absolute inset-0) and sits under the overlays panel, so the View dropdown
// stays reachable to switch back to the scene or a panorama.
export default function DocumentView({ document, canDelete, onDelete }: DocumentViewProps) {
  const url = assetUrl(document.sourceBlobHash);
  return (
    <div className="absolute inset-0 flex flex-col bg-neutral-950">
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
      </div>
      <iframe
        title={document.title}
        src={url}
        className="min-h-0 flex-1 border-0 bg-neutral-900"
      />
    </div>
  );
}
