import { useId, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { useModalDialog } from "@/shared/ui/modal";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

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
  const { ref, shown } = useModalDialog(open, onClose);
  const titleId = useId();

  // Always in the tree, like Modal; `data-side` picks the slide in theme.css.
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-side={side}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        // `open:flex`, never `flex`: an author `display` would show it closed.
        "m-0 h-dvh max-h-none w-[min(24rem,100vw)] max-w-none flex-col gap-3 border-line bg-panel-2 p-4 text-fg shadow-elevation open:flex",
        side === "right" ? "ml-auto border-l" : "mr-auto border-r",
        className,
      )}
    >
      {shown ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="m-0 text-[15px] font-semibold">
              {title}
            </h2>
            <Tooltip label="Close">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-6 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-muted transition-[color,scale] duration-150 ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.95]"
              >
                <Icon name="close" size={14} />
              </button>
            </Tooltip>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">{children}</div>

          {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
