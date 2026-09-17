import { Icon } from "@/shared/ui/icon";

export type CollapsedPillProps = {
  file: string;
  onShow: () => void;
};

/**
 * Mock state 12's stand-in for a hidden document window: the file's name and
 * a way to bring the window back. Positioning (beside the stats strip) is the
 * page's job, not this component's — it only carries its own look.
 */
export function CollapsedPill({ file, onShow }: CollapsedPillProps) {
  return (
    <div className="flex min-w-0 max-w-[260px] items-center gap-2.5 rounded-full border border-line-2 bg-panel px-[13px] py-[7px] font-mono text-[10px] text-fg shadow-elevation">
      <Icon name="file" size={13} className="text-muted" />
      <span className="min-w-0 truncate">{file}</span>
      <button
        type="button"
        onClick={onShow}
        className="cursor-pointer rounded-full border border-line-2 bg-panel-2 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-fg transition-[border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Show
      </button>
    </div>
  );
}
