import { clsx as cx } from "clsx";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export type FileCardProps = {
  name: string;
  meta: string;
  onReplace?: () => void;
  replaceLabel?: string;
  className?: string;
};

/** The chosen-file state of a single-file upload — DropZone's counterpart once a file lands. */
export function FileCard({ name, meta, onReplace, replaceLabel = "Replace", className }: FileCardProps) {
  return (
    <div
      className={cx(
        "relative flex items-center gap-3.5 rounded-[12px] border border-accent border-l-[3px] border-l-accent bg-accent-soft py-[18px] pl-[23px] pr-5",
        className,
      )}
    >
      <Icon name="upload" size={26} className="text-accent" />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[14px] font-semibold">{name}</p>
        <p className="m-0 mt-1 truncate font-mono text-[11px] text-muted">{meta}</p>
      </div>
      {onReplace ? (
        <Button shape="pill" size="sm" onClick={onReplace}>
          {replaceLabel}
        </Button>
      ) : null}
    </div>
  );
}
