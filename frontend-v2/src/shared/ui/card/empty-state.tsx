import type { ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Icon, type IconName } from "@/shared/ui/icon";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** row draws icon | title+description | action, in a single dashed strip. */
  layout?: "center" | "row";
  icon?: IconName;
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  layout = "center",
  icon,
  className,
}: EmptyStateProps) {
  if (layout === "row") {
    return (
      <div
        className={cx(
          "flex items-center gap-3.5 rounded-[14px] border border-dashed border-line-2 p-[26px] text-left",
          className,
        )}
      >
        {icon ? <Icon name={icon} size={22} className="shrink-0 text-muted" /> : null}
        <div className="flex-1">
          <p className="m-0 text-sm font-semibold">{title}</p>
          {description ? <p className="m-0 mt-1 text-xs text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
    );
  }

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
