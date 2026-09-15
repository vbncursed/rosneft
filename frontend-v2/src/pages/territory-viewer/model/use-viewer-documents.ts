import { useCallback, useState } from "react";
import type { Document } from "@/entities/document";
import { useDocumentList, useDocumentView, usePipWindow } from "@/features/document-view";
import { useDocumentUpload } from "@/features/document-upload";
import type { DocumentParts } from "./overlay-parts";

export type ViewerDocumentsParams = {
  slug: string;
  /** The bundle's documents. The page re-keys this hook when it refetches. */
  initial: Document[];
  onChanged: () => void;
  /** Opening a PDF leaves whatever else was on screen — the page passes its exitPanorama. */
  onOpen: () => void;
};

/** The mock's inset for the floating window; Task 16 positions the container it sits in. */
const PIP_INSET = 14;

/**
 * The document half of the viewer: the list, which one is open and in what
 * window, the pip geometry the title bar drags, and the upload dialog.
 *
 * Deleting the open document closes its window for free — `useDocumentView`
 * derives `active` by id against the live list, so the row disappearing is the
 * window disappearing, with no effect in between.
 */
export function useViewerDocuments({
  slug,
  initial,
  onChanged,
  onOpen,
}: ViewerDocumentsParams): DocumentParts {
  const list = useDocumentList({ slug, initial, onChanged });
  const view = useDocumentView(list.documents, onOpen);
  const pip = usePipWindow(PIP_INSET);
  const [uploadOpen, setUploadOpen] = useState(false);

  const upload = useDocumentUpload({
    slug,
    onCreated: useCallback(
      (document: Document) => {
        list.add(document);
        setUploadOpen(false);
      },
      [list],
    ),
  });

  const activeId = view.active?.id ?? null;
  const onDelete = useCallback(() => {
    if (activeId !== null) void list.remove(activeId);
  }, [activeId, list]);

  return {
    list: list.documents,
    pendingId: list.pendingId,
    active: view.active,
    window: view.window,
    pip,
    onOpen: view.open,
    onWindow: view.setWindow,
    onDelete,
    onExit: view.close,
    escape: view.escape,
    upload: {
      open: uploadOpen,
      onOpen: () => setUploadOpen(true),
      onClose: () => setUploadOpen(false),
      form: upload,
    },
  };
}
