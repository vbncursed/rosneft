import type { FileUploadState } from "@/entities/upload";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { DropZone } from "@/shared/ui/drop-zone";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { TextField } from "@/shared/ui/text-field";
import {
  CANCEL,
  CANCEL_UPLOAD,
  CHOOSE_FILE,
  COPY,
  GPS_LABEL,
  TITLE_LABEL,
  UPLOADING,
  closeTitle,
  modalTitle,
  type UploadKind,
} from "../model/copy";
import { UploadFileCard } from "./upload-file-card";

export type UploadModalProps = {
  open: boolean;
  kind: UploadKind;
  territoryTitle: string;
  upload: FileUploadState;
  title: string;
  onTitle: (title: string) => void;
  /** Panorama only — a document has no anchor to place. */
  gps?: { checked: boolean; onChange: (checked: boolean) => void };
  canSubmit: boolean;
  onPick: (files: File[]) => void;
  onClear: () => void;
  onSubmit: () => void;
  onCancelUpload: () => void;
  onClose: () => void;
};

/**
 * `showModal()` focuses the `[autofocus]` descendant, else the first focusable
 * one — here the × beside the heading, so the dialog opened on the way out.
 * React's `autoFocus` only calls `focus()` before that and writes no
 * attribute, so the first thing to do is marked on the DOM: the drop zone,
 * or the title once a file is chosen — unless it is read-only mid-upload,
 * when the dialog's own first stop wins. The ref runs before the dialog opens.
 */
const markFirstTarget = (body: HTMLDivElement | null) => {
  body?.querySelector('label[tabindex="0"], input:not([type="file"]):not([readonly])')?.setAttribute("autofocus", "");
};

/** One dialog for both overlay kinds; every word of the difference is in `copy.ts`. */
export function UploadModal({
  open,
  kind,
  territoryTitle,
  upload,
  title,
  onTitle,
  gps,
  canSubmit,
  onPick,
  onClear,
  onSubmit,
  onCancelUpload,
  onClose,
}: UploadModalProps) {
  const copy = COPY[kind];
  const busy = upload.stage === "uploading" || upload.stage === "creating";
  const close = closeTitle(kind);

  // Every way out — Cancel, the ×, Escape, the dialog's own cancel event — has
  // to give the session back first: this modal does not own the upload (the
  // hook is the page's), so bytes left travelling still finalize and still
  // create the row, minutes after the reader walked away. Nothing to abort once
  // the bytes are in and `work` is running, which is also why `Cancel upload`
  // is gone by then.
  const leave = () => {
    if (upload.stage === "uploading") onCancelUpload();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={leave}
      size="sm"
      title={modalTitle(kind, territoryTitle)}
      // Beside the heading, never inside it: the dialog is named by that
      // heading, and a button in it is read out as part of the name.
      action={
        <button
          type="button"
          onClick={leave}
          aria-label={close}
          title={close}
          className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-line-2 bg-panel-2 text-fg transition-[color,background-color,border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="close" size={12} />
        </button>
      }
      footer={
        <div className="flex w-full items-center gap-4">
          {upload.stage === "uploading" ? (
            <button
              type="button"
              onClick={onCancelUpload}
              className="cursor-pointer border-none bg-transparent p-0 text-xs text-bad hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {CANCEL_UPLOAD}
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-2.5">
            <Button onClick={leave}>{CANCEL}</Button>
            <Button variant="primary" disabled={busy || !canSubmit} onClick={onSubmit}>
              {busy ? UPLOADING : copy.submit}
            </Button>
          </div>
        </div>
      }
    >
      <div ref={markFirstTarget} className="flex flex-col gap-3.5">
        {upload.file ? (
          <UploadFileCard
            file={upload.file}
            glyph={copy.glyph}
            {...(upload.stage === "uploading"
              ? { progress: { percent: upload.percent, label: upload.label } }
              : {})}
            {...(upload.stage === "picked" ? { onReplace: onClear } : {})}
          />
        ) : (
          <DropZone
            label={copy.dropLabel}
            hint={
              upload.stage === "refused" ? (
                // The refusal replaces the hint rather than stacking under it:
                // the line's job is to say what this zone will take, and right
                // now that is the correction.
                <span role="alert" className="text-bad">
                  {upload.reason}
                </span>
              ) : (
                copy.dropHint
              )
            }
            buttonLabel={CHOOSE_FILE}
            accept={copy.accept}
            onFiles={onPick}
          />
        )}

        <TextField
          label={TITLE_LABEL}
          placeholder={copy.placeholder}
          value={title}
          // Read-only, not disabled: a disabled field greys its value to the
          // placeholder's colour, and the title looked lost mid-upload.
          readOnly={busy}
          onChange={(event) => onTitle(event.target.value)}
        />

        {gps ? (
          <Checkbox
            label={GPS_LABEL}
            checked={gps.checked}
            disabled={busy}
            onChange={(event) => gps.onChange(event.target.checked)}
          />
        ) : null}
      </div>
    </Modal>
  );
}
