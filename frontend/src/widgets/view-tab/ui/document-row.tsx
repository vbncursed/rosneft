import { Icon } from "@/shared/ui/icon";

export type DocumentRowProps = {
  id: number;
  name: string;
  onOpen: (id: number) => void;
};

/** One PDF overlay: the file name and the way to put it over the scene. */
export function DocumentRow({ id, name, onOpen }: DocumentRowProps) {
  return (
    <div className="flex items-center gap-2.5 rounded-[9px] border border-line bg-panel-2 px-[11px] py-[9px]">
      <Icon name="file" size={15} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">{name}</span>
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-label={`Open ${name}`}
        title={`Open ${name}`}
        className="shrink-0 cursor-pointer rounded-[7px] border border-line-2 bg-panel px-2.5 py-1 font-mono text-[10px] text-fg transition-[color,border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        Open
      </button>
    </div>
  );
}
