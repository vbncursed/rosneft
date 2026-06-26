"use client";

import Link from "next/link";
import { useDocuments } from "@/document/application/use-documents";
import type { Document } from "@/document/domain/document";
import DocumentRow from "@/document/presentation/components/document-row";
import { useCan } from "@/auth/presentation/current-user-context";

interface DocumentsSectionProps {
  territorySlug: string;
  initial: Document[];
  onOpen: (document: Document) => void;
}

// DocumentsSection lists a territory's PDFs in the overlays panel, next to the
// panorama picker. Each row opens the document in an overlay; add/delete are
// permission-gated by document:write / document:delete.
export default function DocumentsSection({ territorySlug, initial, onOpen }: DocumentsSectionProps) {
  const { documents, remove } = useDocuments(territorySlug, initial);
  const can = useCan();
  const canWrite = can("document:write");
  const canDelete = can("document:delete");

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Documents</h3>
        {canWrite ? (
          <Link
            href={`/territories/${encodeURIComponent(territorySlug)}/documents/new`}
            className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-300 transition-colors hover:bg-white/10"
          >
            + Document
          </Link>
        ) : null}
      </div>
      {documents.length === 0 ? (
        <p className="text-xs text-neutral-500">No documents yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((d) => (
            <DocumentRow
              key={d.id}
              document={d}
              canDelete={canDelete}
              onOpen={onOpen}
              onDelete={remove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
