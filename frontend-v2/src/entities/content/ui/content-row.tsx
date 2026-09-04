import { clsx as cx } from "clsx";
import type { ConversionStatus } from "@/entities/conversion";
import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";
import { Icon } from "@/shared/ui/icon";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { hasArtifacts, type ContentItem } from "../model/content-item";

export type ContentRowProps = {
  item: ContentItem;
  selected?: boolean;
  onSelect?: () => void;
  /** The row's kebab menu, built by the page. */
  actions?: ReactNode;
};

const RAIL: Record<ConversionStatus, string> = {
  ready: "bg-ok",
  pending: "bg-line-2",
  converting: "bg-warn",
  failed: "bg-bad",
};

export function ContentRow({ item, selected = false, onSelect, actions }: ContentRowProps) {
  const converting = item.status === "converting";
  const failed = item.status === "failed";

  return (
    <article
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={item.title}
      className={cx(
        "relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-[11px] border py-3.5 pl-4.5 pr-4 transition-colors duration-150",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "absolute inset-y-0 left-0 w-[3px]",
          RAIL[item.status],
          !selected && "opacity-50",
        )}
      />

      <span
        aria-hidden="true"
        className={cx(
          "flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line-2 bg-panel-2",
          failed ? "text-bad" : "text-dim",
        )}
      >
        <Icon name="cube" size={22} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="min-w-0 truncate text-[13px] font-semibold text-fg">{item.title}</span>
          <Badge
            shape="tag"
            size="sm"
            fill="outline"
            tone={item.kind === "territory" ? "accent" : "neutral"}
            className="tracking-[0.12em]"
          >
            {item.kind}
          </Badge>
          {failed ? (
            <Badge tone="bad" shape="tag" size="sm" className="tracking-[0.1em]">
              failed
            </Badge>
          ) : null}
        </div>

        <p className="m-0 mt-[5px] truncate font-mono text-[10px] text-muted">{item.meta}</p>

        {converting ? (
          <div className="mt-2.5 flex items-center gap-2.5">
            <ProgressBar
              variant="thin"
              className="min-w-0 flex-1 [&>div]:h-1"
              value={item.progress}
              ariaLabel={`${item.title} conversion`}
            />
            {item.stage ? (
              <span className="whitespace-nowrap font-mono text-[10px] text-warn">{item.stage}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3.5">
        <span
          className={cx(
            "whitespace-nowrap font-mono text-[10px] tracking-[0.08em]",
            hasArtifacts(item) ? "text-muted" : "text-dim",
          )}
        >
          {item.lods}
        </span>
        <span className="w-14 text-right font-mono text-[11px] text-dim">{item.size}</span>
        {actions ? (
          // The row is its own click target, so an action inside it would
          // select the row as well and swing the inspector open behind the menu.
          <span onClick={(event) => event.stopPropagation()}>{actions}</span>
        ) : null}
      </div>
    </article>
  );
}
