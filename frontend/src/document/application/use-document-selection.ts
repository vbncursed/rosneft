import { useCallback, useState } from "react";
import { useDocuments } from "@/document/application/use-documents";
import type { Document } from "@/document/domain/document";

// useDocumentSelection bundles the territory's document list (with optimistic
// remove) and the "which document is open" state, so the View dropdown and the
// in-scene PDF view share one source of truth. Selecting a document leaves
// panorama mode via the injected `leavePanorama` callback (the canvas shows the
// PDF in place of the 3D scene).
export function useDocumentSelection(
  territorySlug: string,
  initial: Document[],
  leavePanorama: () => void,
) {
  const { documents, remove } = useDocuments(territorySlug, initial);
  const [activeId, setActiveId] = useState<number | null>(null);
  // PiP (false) vs. full-screen takeover (true). Read by ModelViewer to decide
  // whether to hide the 3D scene; documents open in PiP so objects stay placeable.
  const [fullscreen, setFullscreen] = useState(false);
  const active = documents.find((d) => d.id === activeId) ?? null;

  const select = useCallback(
    (id: number) => {
      leavePanorama();
      setActiveId(id);
      setFullscreen(false);
    },
    [leavePanorama],
  );

  const clear = useCallback(() => {
    setActiveId(null);
    setFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);

  const removeActive = useCallback(async () => {
    if (activeId == null) return;
    await remove(activeId);
    setActiveId(null);
  }, [activeId, remove]);

  return { documents, active, activeId, fullscreen, select, clear, toggleFullscreen, removeActive };
}
