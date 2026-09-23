import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { instanceLine, instanceName, type ModelGroup, type PlacementInstance } from "../model/groups";

export type InstanceRowProps = {
  group: ModelGroup;
  instance: PlacementInstance;
  selected: boolean;
  /** A mutation on this instance is in flight; its controls wait for it. */
  pending: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onSelect: (id: number) => void;
  onRename: (id: number) => void;
  onDelete: (id: number) => void;
  onFocus: (id: number) => void;
};

const ICON_BUTTON =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border transition-[color,background-color,border-color,scale] duration-150 ease-out enabled:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

/** One placed instance under its model: select by name; rename, delete or focus by grant. */
export function InstanceRow({
  group,
  instance,
  selected,
  pending,
  canWrite,
  canDelete,
  onSelect,
  onRename,
  onDelete,
  onFocus,
}: InstanceRowProps) {
  const name = instanceName(group, instance);
  // WCAG 2.5.3: the accessible name has to contain the visible text. The row
  // prints `#2 · Tank 2` and the scene calls the object `storage-tank-500 #2`,
  // so the name is both — the model, the number, then the label the reader gave
  // it. Only the select button prints a label; the icon actions name the
  // instance alone.
  const selectName = instance.label ? `${name} · ${instance.label}` : name;
  const editor = canWrite || canDelete;
  return (
    <div
      className={cx(
        "ml-3 flex items-center gap-2 rounded-[7px] border px-[9px] py-[7px]",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(instance.id)}
        aria-pressed={selected}
        aria-label={selectName}
        className={cx(
          "min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent p-0 text-left font-mono text-[10px] transition-[scale] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
          selected ? "text-accent" : "text-fg",
        )}
      >
        {instanceLine(instance)}
      </button>
      {canWrite ? (
        <Tooltip label={`Rename ${name}`}>
          <button
            type="button"
            onClick={() => onRename(instance.id)}
            disabled={pending}
            aria-label={`Rename ${name}`}
            className={cx(ICON_BUTTON, "border-line-2 bg-panel text-fg hover:border-accent-line")}
          >
            <Icon name="pencil" size={12} />
          </button>
        </Tooltip>
      ) : null}
      {canDelete ? (
        <Tooltip label={`Delete ${name}`}>
          <button
            type="button"
            onClick={() => onDelete(instance.id)}
            disabled={pending}
            aria-label={`Delete ${name}`}
            className={cx(
              ICON_BUTTON,
              selected ? "border-bad bg-bad-soft text-bad" : "border-line-2 bg-panel text-muted hover:text-bad",
            )}
          >
            <Icon name="trash" size={12} />
          </button>
        </Tooltip>
      ) : null}
      {!editor ? (
        <button
          type="button"
          onClick={() => onFocus(instance.id)}
          aria-label={`Focus ${name}`}
          title={`Focus camera on ${name}`}
          className="shrink-0 cursor-pointer rounded-[7px] border border-line-2 bg-panel px-2.5 py-1 font-mono text-[10px] text-fg transition-[border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          Focus
        </button>
      ) : null}
    </div>
  );
}
