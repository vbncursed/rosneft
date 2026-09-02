import type { ReactNode } from "react";
import { clsx as cx } from "clsx";

export type ErrorStateProps = {
  title: ReactNode;
  /** The technical line under the headline — status code, service name. */
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({ title, detail, action, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cx("rounded-card border border-bad bg-bad-soft p-6", className)}>
      <p className="m-0 text-[13px] font-semibold text-bad">{title}</p>
      {detail ? <p className="m-0 mt-1.5 text-xs text-muted">{detail}</p> : null}
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}
