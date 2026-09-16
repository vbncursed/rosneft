import { useEffect } from "react";
import { dismiss, holdNotices, releaseNotices, useNotices } from "@/shared/lib/notify";
import { Toast } from "@/shared/ui/toast";

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
export function Toaster() {
  const notices = useNotices();
  const empty = notices.length === 0;

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
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2"
    >
      {notices.map((notice) => (
        <Toast
          key={notice.id}
          tone={notice.tone}
          onDismiss={() => dismiss(notice.id)}
          dismissLabel={`Dismiss: ${notice.message}`}
          // Enters from above, where the stack is anchored; the exit is instant.
          // The ::after bridges the gap-2 below every card but the last, so
          // crossing from one card to the next never leaves the stack.
          className="pointer-events-auto relative shadow-elevation transition-[opacity,translate] duration-200 ease-out starting:opacity-0 starting:-translate-y-2 motion-reduce:starting:translate-y-0 after:absolute after:inset-x-0 after:top-full after:h-2 last:after:hidden"
        >
          {notice.message}
        </Toast>
      ))}
    </div>
  );
}
