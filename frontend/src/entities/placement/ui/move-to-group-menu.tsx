import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";
import type { PlacementGroup } from "../model/placement";

export const NO_GROUP = "No group";

// The row's 24px glyph-button look. No focus-visible utilities here: Menu's
// base carries the ring, and a second outline-offset would be a coin flip.
const TRIGGER =
  "size-6 shrink-0 justify-center rounded-[6px] border border-line-2 bg-panel text-fg transition-[color,background-color,border-color,scale] duration-150 ease-out enabled:hover:border-accent-line enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:border-accent-line";

export type MoveToGroupMenuProps = {
  /** The instance's name, `storage-tank-500 #2`. */
  name: string;
  groups: PlacementGroup[];
  /** The group it sits in; null is No group. */
  current: number | null;
  /**
   * A write on the placement is in flight: every move waits. The trigger stays
   * live — disabled under the focus it holds after a choice, it would drop that
   * focus to <body>.
   */
  disabled: boolean;
  onMove: (groupId: number | null) => void;
};

/** "Move to group…" (G-4): every group on the territory, then No group; where it already is, greyed. */
export function MoveToGroupMenu({ name, groups, current, disabled, onMove }: MoveToGroupMenuProps) {
  // Nowhere to go: no groups, and it already sits in No group.
  if (groups.length === 0 && current === null) return null;
  return (
    <Menu
      triggerLabel={`Move ${name} to group`}
      trigger={<Icon name="folder-move" size={12} />}
      triggerClassName={TRIGGER}
      items={[
        ...groups.map((g) => ({
          id: `group-${g.id}`,
          label: g.title,
          disabled: disabled || g.id === current,
          onSelect: () => onMove(g.id),
        })),
        { id: "none", label: NO_GROUP, disabled: disabled || current === null, onSelect: () => onMove(null) },
      ]}
    />
  );
}
