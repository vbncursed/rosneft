import { ConversionBadge, StageList, type ConversionStage } from "@/entities/conversion";
import type { ContentItem } from "@/entities/content";
import { Button } from "@/shared/ui/button";
import { DetailList, type Detail } from "@/shared/ui/detail-list";
import { Icon } from "@/shared/ui/icon";
import { ProgressBar } from "@/shared/ui/progress-bar";

export type ContentInspectorProps = {
  item: ContentItem;
  /** source / artifacts / lods / job — resolved by the route. */
  details?: Detail[];
  stages?: ConversionStage[];
  /** Right of the "Conversion" overline, e.g. "62% · ~4 min". */
  conversionNote?: string;

  onClose: () => void;
  /** Absent for a model — there is no source-replace route for one. */
  onReplaceSource?: () => void;
  onOpenInViewer: () => void;
  /** Absent when the viewer may not delete this kind. */
  onDelete?: () => void;
  /** Only a running conversion can be cancelled. */
  onCancelJob?: () => void;
  canManage?: boolean;
};

export function ContentInspector({
  item,
  details = [],
  stages = [],
  conversionNote,
  onClose,
  onReplaceSource,
  onOpenInViewer,
  onDelete,
  onCancelJob,
  canManage = true,
}: ContentInspectorProps) {
  const converting = item.status === "converting";

  return (
    <aside
      aria-label={`Content: ${item.title}`}
      className="overflow-hidden rounded-[14px] border border-accent-line bg-panel shadow-elevation"
    >
      <div
        className="relative flex h-37 items-center justify-center border-b border-line bg-panel-2"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      >
        <Icon name="cube" size={46} className="text-dim" />
        <span className="absolute left-3.5 top-3.5">
          <ConversionBadge status={item.status} />
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 cursor-pointer border-none bg-transparent p-0 leading-none text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4.5 p-4.5">
        <div>
          <p className="m-0 text-base font-semibold text-fg">{item.title}</p>
          <p className="m-0 mt-[3px] font-mono text-[11px] text-muted">
            {item.slug} · {item.kind}
          </p>
        </div>

        {converting ? (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
                Conversion
              </p>
              {conversionNote ? (
                <p className="m-0 font-mono text-[11px] text-warn">{conversionNote}</p>
              ) : null}
            </div>
            <ProgressBar
              className="mt-2.5"
              variant="thin"
              value={item.progress}
              ariaLabel={`${item.title} conversion`}
            />
            {stages.length > 0 ? <StageList stages={stages} className="mt-3" /> : null}
          </div>
        ) : null}

        <DetailList items={details} />

        {canManage ? (
          <div className="flex flex-col gap-2 border-t border-line pt-3.5">
            <div className="flex gap-2">
              {onReplaceSource ? (
                <Button size="sm" className="flex-1 justify-center" onClick={onReplaceSource}>
                  Replace source
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="accent"
                className="flex-1 justify-center"
                onClick={onOpenInViewer}
                disabled={item.status !== "ready"}
              >
                Open in viewer
              </Button>
            </div>
            <div className="flex gap-2">
              {onCancelJob ? (
                <Button
                  size="sm"
                  variant="warning"
                  className="flex-1 justify-center"
                  onClick={onCancelJob}
                >
                  Cancel job
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  size="sm"
                  variant="danger"
                  className="flex-1 justify-center"
                  onClick={onDelete}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
