import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";

export type DropZoneProps = {
  label: string;
  hint: string;
  buttonLabel: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
};

/** The ".zip,.obj" half of an accept string — the part a MIME type can't satisfy anyway. */
function extensionsOf(accept: string): string[] {
  return accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.startsWith("."));
}

function matchesAccept(file: File, accept: string): boolean {
  const extensions = extensionsOf(accept);
  if (extensions.length === 0) return true;
  const name = file.name.toLowerCase();
  return extensions.some((ext) => name.endsWith(ext));
}

/** A labelled file input that also accepts a drag-and-drop, opened by click or Enter/Space. */
export function DropZone({
  label,
  hint,
  buttonLabel,
  accept,
  multiple,
  disabled,
  onFiles,
  className,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    event.preventDefault();
    setOver(true);
  };

  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    event.preventDefault();
    // dragover fires continuously while the pointer is anywhere over the
    // zone, including its children — crossing into one bubbles a dragleave
    // from the label first, so re-asserting `over` here is what undoes that
    // spurious leave instead of the highlight dying mid-hover.
    setOver(true);
  };

  const onDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    event.preventDefault();
    setOver(false);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    event.preventDefault();
    setOver(false);
    const files = [...event.dataTransfer.files].filter((file) => matchesAccept(file, accept));
    if (files.length > 0) onFiles(files);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <label
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cx(
        "flex items-center gap-3.5 rounded-[12px] border border-dashed px-5 py-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        over ? "border-accent bg-accent-soft" : "border-line-2 bg-panel",
        // One property, one branch: clsx cannot resolve two cursor utilities —
        // only the compiled stylesheet's own source order can, and it picks
        // the wrong one.
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
        className,
      )}
    >
      <Icon name="upload" size={24} className="text-muted" />
      <span className="flex-1">
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      </span>
      <span className="rounded-full border border-accent bg-accent-soft px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
        {buttonLabel}
      </span>
      <input
        ref={inputRef}
        type="file"
        aria-label={label}
        tabIndex={-1}
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </label>
  );
}
