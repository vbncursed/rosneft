import { useId, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { useModalDialog } from "./use-modal-dialog";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Mono overline above the title, e.g. "Confirm · danger". */
  overline?: ReactNode;
  /**
   * Drawn on the title's row, beside it — a close button, usually. Outside the
   * `<h2>` on purpose: the dialog's accessible name is that heading, and a
   * button inside it is read out as part of the name.
   */
  action?: ReactNode;
  description?: ReactNode;
  /** Buttons; the design right-aligns them under the body. */
  footer?: ReactNode;
  tone?: "default" | "danger" | "warning";
  /** lg is the 720px box the model picker's four-column grid needs; sm is the 520px upload modal. */
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
  className?: string;
};

export function Modal({
  open,
  onClose,
  title,
  overline,
  action,
  description,
  footer,
  tone = "default",
  size = "md",
  children,
  className,
}: ModalProps) {
  const { ref, shown } = useModalDialog(open, onClose);
  const titleId = useId();

  // Always in the tree: a closed <dialog> is display:none, and staying
  // attached is what lets close() return focus and the exit transition play.
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // The browser would close the element on Escape on its own, which would
      // leave the caller's `open` claiming it is still up. Preventing that and
      // routing through onClose keeps the two in step.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        // Chrome's UA stylesheet gives a modal <dialog> `overflow: auto`, which
        // clips/scrolls an absolutely-positioned floating child (a Dropdown's
        // open list) instead of letting it sit above the box. overflow-visible
        // opts back out.
        // The UA still caps the height at the viewport, so a tall body must
        // scroll a part of its own (`min-h-0 overflow-y-auto`, as the model
        // picker does) — the dialog itself no longer scrolls.
        // The width lives here, once per size: a base utility plus a variant
        // one for the same property is resolved by the stylesheet's source
        // order, not by the className string's. `open:flex`, never `flex`: an
        // author `display` beats the UA's `dialog:not([open]) { display: none }`.
        // The enter/exit transition and the backdrop live in theme.css.
        size === "lg"
          ? "w-[min(45rem,calc(100vw-2rem))]"
          : size === "sm"
            ? "w-[min(32.5rem,calc(100vw-2rem))]"
            : "w-[min(28rem,calc(100vw-2rem))]",
        // `pointer-events` is inherited, and the top layer does not break that
        // chain: mounted under a layer that gave them up (the viewer's document
        // window sits in one), the whole dialog would be unclickable.
        "pointer-events-auto m-auto flex-col gap-3.5 overflow-visible rounded-card border bg-panel p-5 text-fg shadow-elevation open:flex",
        tone === "danger" ? "border-bad" : tone === "warning" ? "border-warn" : "border-line",
        className,
      )}
    >
      {shown ? (
        <>
          {overline ? (
            <p
              className={cx(
                "m-0 font-mono text-[10px] uppercase tracking-[0.2em]",
                tone === "danger" ? "text-bad" : tone === "warning" ? "text-warn" : "text-muted",
              )}
            >
              {overline}
            </p>
          ) : null}

          {action ? (
            <div className="flex items-center justify-between gap-4">
              <h2 id={titleId} className="m-0 text-base font-semibold">
                {title}
              </h2>
              {action}
            </div>
          ) : (
            <h2 id={titleId} className="m-0 text-base font-semibold">
              {title}
            </h2>
          )}

          {description ? (
            <p className="m-0 text-[13px] leading-[1.55] text-muted">{description}</p>
          ) : null}

          {children}

          {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
