"use client";

import type { Document } from "@/document/domain/document";
import DeleteButton from "@/shared/presentation/components/delete-button";

interface DocumentRowProps {
  document: Document;
  canDelete: boolean;
  onOpen: (document: Document) => void;
  onDelete: (id: number) => Promise<void>;
}

// DocumentRow is one entry in the Documents section: the title opens the
// overlay, delete is gated by permission.
export default function DocumentRow({ document, canDelete, onOpen, onDelete }: DocumentRowProps) {
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onOpen(document)}
        className="min-w-0 flex-1 cursor-pointer truncate rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-xs text-neutral-100 transition-colors hover:bg-white/10"
      >
        {document.title}
      </button>
      {canDelete ? (
        <DeleteButton
          label={document.title}
          onDelete={() => onDelete(document.id)}
          className="shrink-0"
        >
          ✕
        </DeleteButton>
      ) : null}
    </li>
  );
}
