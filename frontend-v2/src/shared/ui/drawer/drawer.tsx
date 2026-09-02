import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { useEscape } from "@/shared/lib/use-escape";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
  children: ReactNode;
  className?: string;
};

/** A side panel on the same native <dialog> the Modal uses, so it traps focus. */
export function Drawer({
  open,
  onClose,
  title,
  footer,
  side = "right",
  children,
  className,
}: DrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEscape(open, onClose);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        "m-0 h-dvh max-h-none w-[min(24rem,100vw)] max-w-none flex-col gap-3 border-line bg-panel-2 p-4 text-fg shadow-elevation backdrop:bg-black/55",
        "flex",
        side === "right" ? "ml-auto border-l" : "mr-auto border-r",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="m-0 text-[15px] font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer border-none bg-transparent p-0 text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">{children}</div>

      {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
    </dialog>
  );
}
