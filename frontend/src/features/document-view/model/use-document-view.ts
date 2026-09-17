import { useCallback, useState } from "react";
import type { Document } from "@/entities/document";

export type DocumentWindowMode = "pip" | "collapsed" | "expanded";

// useDocumentView is "which document is open, and in what window mode" —
// paired with useDocumentList's optimistic CRUD so the View dropdown and the
// in-scene PDF window share one source of truth. `active` is derived by id
// lookup against the live `documents` array on every render, so a document
// deleted elsewhere (useDocumentList.remove) closes this window for free —
// no effect needed, `find` just stops finding it.
export function useDocumentView(documents: Document[], onOpen: () => void) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [windowMode, setWindowMode] = useState<DocumentWindowMode>("pip");
  const active = documents.find((d) => d.id === activeId) ?? null;

  const close = useCallback(() => {
    setActiveId(null);
    setWindowMode("pip");
  }, []);

  // Opening a document leaves whatever else was on screen (the page passes
  // its own exitPanorama) before taking over — the two views don't overlay.
  const open = useCallback(
    (id: number) => {
      onOpen();
      setActiveId(id);
      setWindowMode("pip");
    },
    [onOpen],
  );

  const setWindow = useCallback((mode: DocumentWindowMode) => setWindowMode(mode), []);

  // Esc steps expanded back down to pip first; pip or collapsed close outright.
  const escape = useCallback((): boolean => {
    if (activeId === null) return false;
    if (windowMode === "expanded") {
      setWindowMode("pip");
      return true;
    }
    close();
    return true;
  }, [activeId, windowMode, close]);

  return { active, window: windowMode, open, close, setWindow, escape };
}
