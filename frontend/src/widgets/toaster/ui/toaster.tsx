import { useEffect, useRef, type FocusEvent } from "react";
import { clsx as cx } from "clsx";
import { dismiss, holdNotices, releaseNotices, useNotices } from "@/shared/lib/notify";
import { Toast } from "@/shared/ui/toast";

export type ToasterPlacement = "top-right" | "bottom-center";

// Where the stack is anchored, which way it grows, the edge its cards enter
// from, and which card's hover bridge (the ::after below it) has nothing below
// to reach. The newest card always sits at the anchored edge. The viewer keeps
// its top-right corner for the Overlays panel's head, so there the stack sits
// bottom-centre, above the status strip.
const PLACEMENT: Record<ToasterPlacement, { host: string; card: string }> = {
  "top-right": { host: "right-4 top-4 flex-col", card: "starting:-translate-y-2 last:after:hidden" },
  "bottom-center": {
    host: "bottom-16 left-1/2 -translate-x-1/2 flex-col-reverse",
    card: "starting:translate-y-2 first:after:hidden",
  },
};

const onVisibility = () =>
  document.hidden ? holdNotices("hidden") : releaseNotices("hidden");

/**
 * The one place notices are drawn. Mounted by the console shell; the login
 * screen keeps its own single Toast because it has no shell.
 *
 * The container is always in the DOM: a live region announces only what
 * changes after it exists, so one created together with the first notice is
 * read unreliably. Errors and warnings still carry their own `alert`.
 */
export function Toaster({ placement = "top-right" }: { placement?: ToasterPlacement }) {
  const { host, card } = PLACEMENT[placement];
  const notices = useNotices();
  const empty = notices.length === 0;

  // Where focus came from when it entered the stack. A card leaves under the
  // pointer, and without this focus would fall to <body> after Retry or Dismiss.
  // The way back is used once, forgotten when focus leaves the stack, and taken
  // only while focus is still in the stack or lost — never out of a field the
  // reader has moved on to (Safari focuses no button on click).
  const region = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const from = e.relatedTarget;
    if (from instanceof HTMLElement && !e.currentTarget.contains(from)) cameFrom.current = from;
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) cameFrom.current = null;
  };
  const close = (id: number) => {
    const back = cameFrom.current;
    cameFrom.current = null;
    const active = document.activeElement;
    const lost = !active || active === document.body || region.current?.contains(active);
    dismiss(id);
    if (lost && back?.isConnected) back.focus();
  };

  // Read once on mount — a background tab fires nothing until it is shown —
  // and give both holds back on unmount: they live in the module, and a shell
  // leaving mid-hover would otherwise stop the clocks for the next one.
  useEffect(() => {
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      releaseNotices("hover");
      releaseNotices("hidden");
    };
  }, []);

  // A card dismissed under the pointer leaves without a mouseleave.
  useEffect(() => {
    if (empty) releaseNotices("hover");
  }, [empty]);

  return (
    // pointer-events-none lets clicks reach the page between cards; each card
    // turns them back on for its own dismiss button.
    <div
      aria-live="polite"
      onMouseEnter={() => holdNotices("hover")}
      onMouseLeave={() => releaseNotices("hover")}
      ref={region}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cx("pointer-events-none fixed z-50 flex w-[min(92vw,22rem)] gap-2", host)}
    >
      {notices.map((notice) => (
        <Toast
          key={notice.id}
          tone={notice.tone}
          onDismiss={() => close(notice.id)}
          dismissLabel={`Dismiss: ${notice.message}`}
          action={
            notice.action && {
              label: notice.action.label,
              name: `${notice.action.label}: ${notice.message}`,
              onClick: () => {
                close(notice.id);
                notice.action!.run();
              },
            }
          }
          // Enters from the edge the stack is anchored to; the exit is instant.
          // The ::after bridges the gap-2 below every card but the bottom one,
          // so crossing from one card to the next never leaves the stack.
          className={cx(
            "pointer-events-auto relative shadow-elevation transition-[opacity,translate] duration-200 ease-out starting:opacity-0 motion-reduce:starting:translate-y-0 after:absolute after:inset-x-0 after:top-full after:h-2",
            card,
          )}
        >
          {notice.message}
        </Toast>
      ))}
    </div>
  );
}
