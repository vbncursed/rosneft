import { useState, type PointerEvent } from "react";
import { assetUrl } from "@/entities/content";
import { documentFileName, type Document } from "@/entities/document";
import type { DocumentWindowMode, PipGeometry } from "@/features/document-view";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { ViewportWindow, type ViewportWindowAction } from "@/shared/ui/viewport-window";
import { CollapsedPill } from "./collapsed-pill";

export type DocumentWindowProps = {
  document: Document;
  window: DocumentWindowMode;
  canDelete: boolean;
  pip: {
    geo: PipGeometry;
    dragging: boolean;
    startMove: (e: PointerEvent<HTMLElement>) => void;
    startResize: (e: PointerEvent<HTMLElement>) => void;
  };
  onWindow: (mode: DocumentWindowMode) => void;
  onDelete: () => void;
  onExit: () => void;
  /** Cosmos cannot load the real pdf.js viewer without the gateway; defaults to it. */
  frameSrc?: string;
};

function actionsFor(
  mode: DocumentWindowMode,
  file: string,
  canDelete: boolean,
  onWindow: (mode: DocumentWindowMode) => void,
  onExit: () => void,
  askDelete: () => void,
): ViewportWindowAction[] {
  const del: ViewportWindowAction[] = canDelete
    ? [{ name: `Delete ${file}`, icon: "trash", tone: "bad", onClick: askDelete }]
    : [];
  const exit: ViewportWindowAction = { name: "Exit document overlay", icon: "close", onClick: onExit };

  if (mode === "expanded") {
    return [
      { name: `Restore ${file} to a window`, icon: "minimize", onClick: () => onWindow("pip") },
      ...del,
      exit,
    ];
  }
  return [
    { name: `Expand ${file}`, icon: "maximize", onClick: () => onWindow("expanded") },
    { name: `Hide ${file}`, icon: "minus", onClick: () => onWindow("collapsed") },
    ...del,
    exit,
  ];
}

/**
 * The mock's document overlay (state 12): pdf.js in a `ViewportWindow`,
 * picture-in-picture by default so a placement can still be made against the
 * live scene. Collapsing only hides the window (`hidden`, never unmounted) so
 * the frame's own zoom/page survive; the pill in its place is `CollapsedPill`.
 * Delete always confirms first, regardless of window mode.
 */
export function DocumentWindow({
  document,
  window: mode,
  canDelete,
  pip,
  onWindow,
  onDelete,
  onExit,
  frameSrc,
}: DocumentWindowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const file = documentFileName(document);
  const src = frameSrc ?? `/pdfjs/web/viewer.html?file=${encodeURIComponent(assetUrl(document.sourceBlobHash))}`;
  const actions = actionsFor(mode, file, canDelete, onWindow, onExit, () => setConfirmOpen(true));

  return (
    <>
      <div hidden={mode === "collapsed"}>
        <ViewportWindow
          title={file}
          geometry={mode === "expanded" ? null : pip.geo}
          actions={actions}
          onMoveStart={pip.startMove}
          onResizeStart={pip.startResize}
          dragging={pip.dragging}
        >
          <iframe title={file} src={src} className="size-full border-0" />
        </ViewportWindow>
      </div>

      {mode === "collapsed" ? <CollapsedPill file={file} onShow={() => onWindow("pip")} /> : null}

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${file}?`}
        description="The document is removed from this territory."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
