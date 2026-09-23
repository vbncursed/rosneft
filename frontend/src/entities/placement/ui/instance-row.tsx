import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { instanceLine, instanceName, type ModelGroup, type PlacementInstance } from "../model/groups";
import type { PlacementGroup } from "../model/placement";
import { EyeButton } from "./eye-button";
import { MoveToGroupMenu } from "./move-to-group-menu";

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
  /** Shows or hides it for everyone; the eye is drawn only with this and `canWrite`. */
  onHide?: (id: number, hidden: boolean) => void;
  /** The territory's groups, the move menu's targets. */
  groups?: PlacementGroup[];
  /** The move menu is drawn only with this and `canWrite`. */
  onMove?: (id: number, groupId: number | null) => void;
  /** Prints the model title before `#N` — a user group mixes models, so the number alone names nothing. */
  showModel?: boolean;
};

const ICON_BUTTON =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border transition-[color,background-color,border-color,scale] duration-150 ease-out enabled:active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

/** One placed instance: eye, select by name, then move, rename, delete or focus — each by grant. */
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
  onHide,
  groups = [],
  onMove,
  showModel = false,
}: InstanceRowProps) {
  const name = instanceName(group, instance);
  // WCAG 2.5.3: the accessible name has to contain the visible text. The row
  // prints `#2 · Tank 2` and the scene calls the object `storage-tank-500 #2`,
  // so the name is both — the model, the number, then the label the reader gave
  // it. Only the select button prints a label; the icon actions name the
  // instance alone. A hidden row says so in words too: its dimming alone is colour.
  const labelled = instance.label ? `${name} · ${instance.label}` : name;
  const selectName = instance.hidden ? `${labelled} · hidden` : labelled;
  const editor = canWrite || canDelete;
  return (
    <div
      className={cx(
        "ml-3 flex items-center gap-2 rounded-[7px] border px-[9px] py-[7px]",
        selected ? "border-accent bg-accent-soft" : "border-line bg-panel",
      )}
    >
      {canWrite && onHide ? (
        <EyeButton
          state={instance.hidden ? "hidden" : "visible"}
          subject={name}
          disabled={pending}
          onToggle={(hidden) => onHide(instance.id, hidden)}
        />
      ) : instance.hidden ? (
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Icon name="eye-off" size={12} className="text-muted" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onSelect(instance.id)}
        aria-pressed={selected}
        aria-label={selectName}
        className={cx(
          "min-w-0 flex-1 cursor-pointer truncate border-none bg-transparent p-0 text-left font-mono text-[10px] transition-[scale] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
          selected ? "text-accent" : "text-fg",
          instance.hidden && "opacity-55",
        )}
      >
        {showModel ? `${group.model.title} ${instanceLine(instance)}` : instanceLine(instance)}
      </button>
      {canWrite && onMove ? (
        <MoveToGroupMenu
          name={name}
          groups={groups}
          current={instance.groupId}
          disabled={pending}
          onMove={(groupId) => onMove(instance.id, groupId)}
        />
      ) : null}
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
        // Nothing is drawn to frame on a hidden placement (§1.7).
        <Tooltip label={instance.hidden ? `${name} is hidden` : `Focus camera on ${name}`}>
          <button
            type="button"
            onClick={() => onFocus(instance.id)}
            disabled={instance.hidden}
            aria-label={instance.hidden ? `Focus ${name} (hidden)` : `Focus ${name}`}
            className="shrink-0 cursor-pointer rounded-[7px] border border-line-2 bg-panel px-2.5 py-1 font-mono text-[10px] text-fg transition-[border-color,scale] duration-150 ease-out enabled:hover:border-accent-line enabled:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Focus
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
