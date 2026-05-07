"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface DeleteButtonProps {
  // What we're deleting (used in the confirm prompt).
  label: string;
  // Async deleter — usually the gateway call.
  onDelete: () => Promise<void>;
  // Where to navigate after successful delete. When omitted, just
  // router.refresh() the current page.
  redirectTo?: string;
  // Tailwind class override for the trigger.
  className?: string;
  // Trigger label; defaults to "Удалить".
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Удалить «${label}»?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await onDelete();
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "ошибка");
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        className={
          className ??
          "cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-200 transition-colors duration-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {pending ? "Удаление…" : (children ?? "Удалить")}
      </button>
      {error ? (
        <span className="text-[10px] text-red-300">{error}</span>
      ) : null}
    </span>
  );
}
