import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { useEscape } from "@/shared/lib/use-escape";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Mono overline above the title, e.g. "Confirm · danger". */
  overline?: ReactNode;
  description?: ReactNode;
  /** Buttons; the design right-aligns them under the body. */
  footer?: ReactNode;
  tone?: "default" | "danger";
  children?: ReactNode;
  className?: string;
};

export function Modal({
  open,
  onClose,
  title,
  overline,
  description,
  footer,
  tone = "default",
  children,
  className,
}: ModalProps) {
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
      // The browser would close the element on Escape on its own, which would
      // leave the caller's `open` claiming it is still up. Preventing that and
      // routing through onClose keeps the two in step.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        "m-auto flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3.5 rounded-card border bg-panel p-5 text-fg shadow-elevation backdrop:bg-black/55",
        tone === "danger" ? "border-bad" : "border-line",
        className,
      )}
    >
      {overline ? (
        <p
          className={cx(
            "m-0 font-mono text-[10px] uppercase tracking-[0.2em]",
            tone === "danger" ? "text-bad" : "text-muted",
          )}
        >
          {overline}
        </p>
      ) : null}

      <h2 id={titleId} className="m-0 text-base font-semibold">
        {title}
      </h2>

      {description ? (
        <p className="m-0 text-[13px] leading-[1.55] text-muted">{description}</p>
      ) : null}

      {children}

      {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
    </dialog>
  );
}
