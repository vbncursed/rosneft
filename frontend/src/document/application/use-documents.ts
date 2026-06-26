import { useCallback, useState } from "react";
import {
  createDocument,
  deleteDocument,
} from "@/document/infrastructure/document-gateway";
import type { Document } from "@/document/domain/document";
import { formatError } from "@/shared/infrastructure/http/format-error";
import { notify } from "@/shared/presentation/toast/use-toast";

// useDocuments wraps the document list with optimistic add/remove. The initial
// array comes from the server-side scene bundle.
export function useDocuments(territorySlug: string, initial: Document[]) {
  const [documents, setDocuments] = useState<Document[]>(initial);

  const add = useCallback(
    async (title: string, sourceBlobHash: string) => {
      try {
        const created = await createDocument(territorySlug, { title, sourceBlobHash });
        setDocuments((prev) => [...prev, created]);
        notify.success("Document added");
        return created;
      } catch (err) {
        notify.error(`Failed to add document: ${formatError(err)}`);
        return null;
      }
    },
    [territorySlug],
  );

  const remove = useCallback(
    async (id: number) => {
      let prev: Document[] = [];
      setDocuments((d) => {
        prev = d;
        return d.filter((x) => x.id !== id);
      });
      try {
        await deleteDocument(territorySlug, id);
        notify.success("Document deleted");
      } catch (err) {
        setDocuments(prev);
        notify.error(`Failed to delete document: ${formatError(err)}`);
      }
    },
    [territorySlug],
  );

  return { documents, add, remove };
}
