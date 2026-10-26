import { Icon } from "@/shared/ui/icon";

export type DocumentRowProps = {
  id: number;
  name: string;
  onOpen: (id: number) => void;
  /** `zone:write` only: opens the plan editor on this file. */
  onAlign?: (id: number) => void;
  /** The plan is already aligned to the model, so the editor is for its zones. */
  aligned?: boolean;
};

const BUTTON =
  "shrink-0 cursor-pointer rounded-[7px] border border-line-2 bg-panel px-2.5 py-1 font-mono text-[10px] text-fg transition-[color,border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

/** One PDF overlay: the file name and the way to put it over the scene. */
export function DocumentRow({ id, name, onOpen, onAlign, aligned = false }: DocumentRowProps) {
  return (
    <div className="flex items-center gap-2.5 rounded-[9px] border border-line bg-panel-2 px-[11px] py-[9px]">
      <Icon name="file" size={15} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">{name}</span>
      {onAlign ? (
        <button
          type="button"
          onClick={() => onAlign(id)}
          aria-label={aligned ? `Edit zones of ${name}` : `Align plan for ${name}`}
          className={BUTTON}
        >
          {aligned ? "Edit zones" : "Align plan"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-label={`Open ${name}`}
        title={`Open ${name}`}
        className={BUTTON}
      >
        Open
      </button>
    </div>
  );
}
