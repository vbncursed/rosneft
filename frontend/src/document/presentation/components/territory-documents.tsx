"use client";

import { useState } from "react";
import type { Document } from "@/document/domain/document";
import DocumentsSection from "@/document/presentation/components/documents-section";
import DocumentOverlay from "@/document/presentation/components/document-overlay";

interface TerritoryDocumentsProps {
  territorySlug: string;
  documents: Document[];
}

// TerritoryDocuments owns the "which document is open" state so the viewer
// panel can drop in one self-contained widget: the list section plus the
// fullscreen overlay that opens when a row is clicked.
export default function TerritoryDocuments({ territorySlug, documents }: TerritoryDocumentsProps) {
  const [open, setOpen] = useState<Document | null>(null);
  return (
    <>
      <DocumentsSection territorySlug={territorySlug} initial={documents} onOpen={setOpen} />
      {open ? <DocumentOverlay document={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
