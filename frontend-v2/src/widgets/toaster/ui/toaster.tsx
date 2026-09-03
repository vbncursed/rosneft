import { dismiss, useNotices } from "@/shared/lib/notify";
import { Toast } from "@/shared/ui/toast";

/**
 * The one place notices are drawn. Mounted by the console shell; the login
 * screen keeps its own single Toast because it has no shell.
 */
export function Toaster() {
  const notices = useNotices();
  if (notices.length === 0) return null;
  return (
    // pointer-events-none lets clicks reach the page between cards; each card
    // turns them back on for its own dismiss button.
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      {notices.map((notice) => (
        <Toast
          key={notice.id}
          tone={notice.tone}
          onDismiss={() => dismiss(notice.id)}
          dismissLabel={`Dismiss: ${notice.message}`}
          className="pointer-events-auto shadow-elevation"
        >
          {notice.message}
        </Toast>
      ))}
    </div>
  );
}
