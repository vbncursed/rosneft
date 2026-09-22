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
  /**
   * False where the page draws the pill itself — the viewer puts it in the
   * stats strip's own row, so its offset follows the strip's real width. The
   * window is hidden either way; only the pill changes hands.
   */
  showPill?: boolean;
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
    ? [{ name: `Delete ${file}`, tooltip: "Delete", icon: "trash", tone: "bad", onClick: askDelete }]
    : [];
  const exit: ViewportWindowAction = { name: "Exit document overlay", icon: "close", onClick: onExit };

  // Four actions in every mode (mock 12): expanding swaps Expand for Restore
  // and changes nothing else, so a reader can still put the window away.
  const first: ViewportWindowAction =
    mode === "expanded"
      ? { name: `Restore ${file} to a window`, tooltip: "Restore", icon: "minimize", onClick: () => onWindow("pip") }
      : { name: `Expand ${file}`, tooltip: "Expand", icon: "maximize", onClick: () => onWindow("expanded") };

  return [
    first,
    { name: `Hide ${file}`, tooltip: "Hide", icon: "minus", onClick: () => onWindow("collapsed") },
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
  showPill = true,
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

      {mode === "collapsed" && showPill ? (
        <CollapsedPill file={file} onShow={() => onWindow("pip")} />
      ) : null}

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
