import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDocument, type Document } from "@/entities/document";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type DocumentListParams = {
  slug: string;
  initial: Document[];
  /** Every settled mutation calls this; the page refetches the scene bundle. */
  onChanged: () => void;
};

// useDocumentList wraps the territory's document list with optimistic remove
// against the DELETE endpoint — the same shape as usePanoramaList. The
// initial array comes from the scene bundle; `add` appends what the upload
// form already created, no gateway call of its own.
export function useDocumentList({ slug, initial, onChanged }: DocumentListParams) {
  const [documents, setDocuments] = useState<Document[]>(initial);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const add = useCallback((d: Document) => setDocuments((prev) => [...prev, d]), []);

  // Optimistically drop the row, then issue the DELETE; on failure restore
  // the previous list and surface the error.
  const remove = useCallback(
    async (id: number) => {
      const prev = documentsRef.current;
      setPendingId(id);
      setDocuments((d) => d.filter((x) => x.id !== id));
      try {
        await deleteDocument(slug, id);
        notify.success("Document deleted");
      } catch (err) {
        setDocuments(prev);
        notify.error(messageOf(err));
      } finally {
        // Both ways: a refused delete may mean the row is already gone for
        // another reason, and only the gateway can say. The page re-keys this
        // hook on the bundle it refetches.
        onChanged();
        setPendingId(null);
      }
    },
    [slug, onChanged],
  );

  return { documents, pendingId, add, remove };
}
