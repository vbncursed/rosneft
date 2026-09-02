import type { ReactNode } from "react";
import { clsx as cx } from "clsx";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "rounded-card border border-dashed border-line-2 bg-panel p-6 text-center text-fg",
        className,
      )}
    >
      <p className="m-0 text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mx-0 mb-3.5 mt-1.5 text-xs text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
