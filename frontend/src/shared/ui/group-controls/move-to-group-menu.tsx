import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";

/** One place an item can go: a key the caller understands, and the words the menu prints. */
export type MoveTarget = { key: string; label: string };

// The row's 24px glyph-button look. No focus-visible utilities here: Menu's
// base carries the ring, and a second outline-offset would be a coin flip.
const TRIGGER =
  "size-6 shrink-0 justify-center rounded-[6px] border border-line-2 bg-panel text-fg transition-[color,background-color,border-color,scale] duration-150 ease-out enabled:hover:border-accent-line enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:border-accent-line";

export type MoveToGroupMenuProps = {
  /** The trigger's name, after its subject: `Move storage-tank-500 #2 to group`. */
  triggerLabel: string;
  /** Every destination, in menu order. */
  targets: MoveTarget[];
  /** The key of where it sits now — that item greys; null when it sits in none of them. */
  current: string | null;
  /**
   * A write on the item is in flight: every move waits. The trigger stays
   * live — disabled under the focus it holds after a choice, it would drop that
   * focus to <body>.
   */
  disabled: boolean;
  onMove: (key: string) => void;
};

/** "Move to…": every target, where it already is greyed; nothing at all when there is nowhere else to go. */
export function MoveToGroupMenu({ triggerLabel, targets, current, disabled, onMove }: MoveToGroupMenuProps) {
  if (targets.every((t) => t.key === current)) return null;
  return (
    <Menu
      triggerLabel={triggerLabel}
      trigger={<Icon name="folder-move" size={12} />}
      triggerClassName={TRIGGER}
      items={targets.map((t) => ({
        id: t.key,
        label: t.label,
        disabled: disabled || t.key === current,
        onSelect: () => onMove(t.key),
      }))}
    />
  );
}
