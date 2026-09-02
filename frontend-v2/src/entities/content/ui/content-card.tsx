import { clsx as cx } from "clsx";
import { ConversionBadge } from "@/entities/conversion";
import { Icon } from "@/shared/ui/icon";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { contentPath, isOpenable, type ContentItem } from "../model/content-item";

export type ContentCardProps = {
  item: ContentItem;
  onReplace?: () => void;
  onDelete?: () => void;
};

const ICON_BUTTON =
  "flex cursor-pointer border-none bg-transparent p-0 text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ContentCard({ item, onReplace, onDelete }: ContentCardProps) {
  const converting = item.status === "converting";
  const open = isOpenable(item);

  return (
    <article
      aria-label={item.title}
      className={cx(
        "overflow-hidden rounded-card border bg-panel",
        converting ? "border-warn" : "border-line",
      )}
    >
      <div className="relative flex h-30 items-center justify-center border-b border-line bg-panel-2">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <Icon name="cube" size={26} className="text-dim" />
        )}
        <span className="absolute left-3 top-3">
          <ConversionBadge status={item.status} />
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">
        <div>
          <p className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-fg">{item.title}</p>
          <p className="m-0 mt-1 font-mono text-[11px] text-muted">{item.slug}</p>
        </div>

        <div className="flex flex-wrap gap-3.5 font-mono text-[10px] text-dim">
          <span className="text-accent">{item.kind}</span>
          <span>{item.size}</span>
          <span>LOD {item.lods}</span>
          <span>{item.updated}</span>
        </div>

        {converting ? (
          <div>
            <ProgressBar
              value={item.progress}
              tone="accent"
              ariaLabel={`${item.title} conversion`}
              className="[&>div]:h-1"
            />
            {item.stage ? (
              <p className="m-0 mt-1.5 font-mono text-[10px] text-warn">{item.stage}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
          {open ? (
            <a
              href={contentPath(item)}
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent no-underline hover:underline"
            >
              Open →
            </a>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
              {converting ? "Converting" : "Unavailable"}
            </span>
          )}

          <div className="flex gap-2.5">
            {onReplace ? (
              <button
                type="button"
                onClick={onReplace}
                title="Replace source"
                aria-label={`Replace source of ${item.title}`}
                className={ICON_BUTTON}
              >
                <Icon name="refresh" size={14} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                title="Delete"
                aria-label={`Delete ${item.title}`}
                className={ICON_BUTTON}
              >
                <Icon name="trash" size={14} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
