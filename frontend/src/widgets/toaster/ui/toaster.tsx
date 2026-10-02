import { useRef, useSyncExternalStore, type FocusEvent } from "react";
import { dismiss, useNotices } from "@/shared/lib/notify";
import { ToastStack, type ToastStackProps } from "@/shared/ui/toast";

export type ToasterPlacement = "top-right" | "bottom-center";

// ToastStack's own corner is top-right. The viewer keeps that corner for the
// Overlays panel's head, so there the stack sits bottom-centre, above the
// status strip. pointer-events-none lets clicks reach the page between cards;
// each card turns them back on for itself.
const PLACEMENT: Record<ToasterPlacement, Pick<ToastStackProps, "position" | "className">> = {
  "top-right": { position: "fixed", className: "pointer-events-none" },
  "bottom-center": {
    position: "inline",
    className: "pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2",
  },
};

function onVisibilityChange(listener: () => void): () => void {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

/**
 * The one place notices are drawn. Mounted by the console shell; the login
 * screen keeps its own single Toast because it has no shell.
 *
 * The container is always in the DOM: a live region announces only what
 * changes after it exists, so one created together with the first notice is
 * read unreliably.
 */
export function Toaster({ placement = "top-right" }: { placement?: ToasterPlacement }) {
  const notices = useNotices();
  // A card's countdown runs only while it is drawn, so a hidden tab draws none:
  // a confirmation reported while the reader was away is still there for them.
  const hidden = useSyncExternalStore(
    onVisibilityChange,
    () => document.hidden,
    () => false,
  );

  // Where focus came from when it entered the stack. A card leaves under the
  // pointer, and without this focus would fall to <body> after Retry or Dismiss.
  // The way back is used once, forgotten when focus leaves the stack, and taken
  // only when focus is lost or sits in the card that is closing — never out of a
  // field the reader has moved on to (Safari focuses no button on click), and
  // never because another card timed out around the one the reader is in.
  const cameFrom = useRef<HTMLElement | null>(null);
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const from = e.relatedTarget;
    if (from instanceof HTMLElement && !e.currentTarget.contains(from)) cameFrom.current = from;
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) cameFrom.current = null;
  };
  // `inCard`: the caller is that card's own button, so focus is in the card even
  // though it is not leaving yet (Retry). Dismiss and expiry arrive with the card
  // marked data-leaving.
  const close = (id: number, inCard = false) => {
    const active = document.activeElement;
    const lost = !active || active === document.body || inCard || !!active.closest(".toast[data-leaving]");
    const back = lost ? cameFrom.current : null;
    if (lost) cameFrom.current = null;
    dismiss(id);
    if (back?.isConnected) back.focus();
  };

  return (
    // display: contents — the wrapper only catches focus for the way back.
    <div onFocus={onFocus} onBlur={onBlur} className="contents">
      <ToastStack
        {...PLACEMENT[placement]}
        onDismiss={(id) => close(Number(id))}
        toasts={
          hidden
            ? []
            : notices.map((notice) => ({
                id: notice.id,
                tone: notice.tone,
                children: notice.message,
                dismissLabel: `Dismiss: ${notice.message}`,
                className: "pointer-events-auto",
                action: notice.action && {
                  label: notice.action.label,
                  name: `${notice.action.label}: ${notice.message}`,
                  onClick: () => {
                    close(notice.id, true);
                    notice.action!.run();
                  },
                },
              }))
        }
      />
    </div>
  );
}
