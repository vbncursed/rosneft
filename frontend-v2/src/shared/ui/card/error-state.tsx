import type { ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Icon, type IconName } from "@/shared/ui/icon";

export type ErrorStateProps = {
  title: ReactNode;
  /** The technical line under the headline — status code, service name. */
  detail?: ReactNode;
  action?: ReactNode;
  /**
   * md is the inline strip an inspector or a list draws in place of its rows.
   * lg is the centred card a whole viewport draws when nothing rendered: an
   * icon tile, a headline, a paragraph, an action row and a footnote.
   */
  size?: "md" | "lg";
  /** lg only: the glyph in the tile above the headline. */
  icon?: IconName;
  /** lg only: the mono footnote under the actions — the file, the last attempt. */
  footer?: ReactNode;
  className?: string;
};

export function ErrorState({
  title,
  detail,
  action,
  size = "md",
  icon,
  footer,
  className,
}: ErrorStateProps) {
  if (size === "lg") {
    return (
      <div
        role="alert"
        className={cx(
          "flex w-[520px] max-w-full flex-col items-center gap-3.5 rounded-[14px] border border-bad bg-panel px-8 py-[34px] text-center shadow-elevation",
          className,
        )}
      >
        {icon ? (
          <span className="flex size-[46px] items-center justify-center rounded-card border border-bad bg-bad-soft text-bad">
            <Icon name={icon} size={22} />
          </span>
        ) : null}
        <p className="m-0 text-lg font-semibold tracking-[-0.015em] text-fg">{title}</p>
        {detail ? (
          <p className="m-0 max-w-[44ch] text-[13px] leading-[1.6] text-muted">{detail}</p>
        ) : null}
        {action ? <div className="flex flex-wrap items-center justify-center gap-[9px]">{action}</div> : null}
        {footer ? <p className="m-0 font-mono text-[10px] text-dim">{footer}</p> : null}
      </div>
    );
  }

  return (
    <div role="alert" className={cx("rounded-card border border-bad bg-bad-soft p-6", className)}>
      <p className="m-0 text-[13px] font-semibold text-bad">{title}</p>
      {detail ? <p className="m-0 mt-1.5 text-xs text-muted">{detail}</p> : null}
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}
