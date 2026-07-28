"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notify } from "@/shared/application/toast/notify";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";

interface DeleteButtonProps {
  // What we're deleting (used in the confirm prompt).
  label: string;
  // Async deleter — usually the gateway call.
  onDelete: () => Promise<void>;
  // Where to navigate after successful delete. When omitted, the active
  // queries are invalidated so the current page's data refetches in place.
  redirectTo?: string;
  // Tailwind class override for the trigger.
  className?: string;
  // Trigger label; defaults to "Delete".
  children?: React.ReactNode;
}

// DeleteButton wraps a destructive action behind a confirm dialog. Used
// on territory + model cards (homepage, /models) and detail pages so the
// user can clear out failed conversions or stale entries without going
// to curl. Errors surface as an inline message under the button.
export default function DeleteButton({
  label,
  onDelete,
  redirectTo,
  className,
  children,
}: DeleteButtonProps) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const handle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirmAction({
      title: "Delete",
      message: `Delete "${label}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await onDelete();
        // redirectTo → leave the page (hard nav, fresh state); otherwise
        // refetch the current data (scene/list queries) so the deleted item drops.
        if (redirectTo) window.location.assign(redirectTo);
        else await queryClient.invalidateQueries();
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className={
        className ??
        "cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-200 transition-colors duration-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {pending ? "Deleting…" : (children ?? "Delete")}
    </button>
  );
}
