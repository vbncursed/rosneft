import { Button } from "@/shared/ui/button";
import { Icon, type IconName } from "@/shared/ui/icon";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { REPLACE, fileSize } from "../model/copy";

export type UploadFileCardProps = {
  file: File;
  /** `panorama` or `file` — the thumb stands in for a preview nobody has decoded yet. */
  glyph: IconName;
  /** Present only while the bytes travel; the label is the upload's own line. */
  progress?: { percent: number; label: string };
  onReplace?: () => void;
};

/**
 * The chosen file, and its progress once it starts moving. Not `shared/ui`'s
 * `FileCard`: this one carries the mock's 44×34 thumb, the mono name/size pair
 * and the track — that card is the upload pages' wider row.
 */
export function UploadFileCard({ file, glyph, progress, onReplace }: UploadFileCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-[11px] border border-line-2 bg-panel-2 p-3">
      <span className="flex h-[34px] w-11 shrink-0 items-center justify-center rounded-[6px] border border-line-2 bg-panel text-muted">
        <Icon name={glyph} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate font-mono text-[11px] text-fg">{file.name}</p>
        {progress ? (
          <>
            <ProgressBar
              value={progress.percent}
              variant="thin"
              ariaLabel={progress.label}
              className="mt-2"
            />
            <p className="m-0 mt-2 font-mono text-[10px] text-accent">{progress.label}</p>
          </>
        ) : (
          <p className="m-0 mt-1 font-mono text-[10px] text-muted">{fileSize(file.size)}</p>
        )}
      </div>
      {onReplace ? (
        <Button shape="pill" size="sm" onClick={onReplace}>
          {REPLACE}
        </Button>
      ) : null}
    </div>
  );
}
