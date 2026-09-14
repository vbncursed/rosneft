import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { groupLine, type PlacementGroup } from "../model/groups";

export type GroupRowProps = {
  group: PlacementGroup;
  expanded: boolean;
  selectedId: number | null;
  onToggle: () => void;
};

/** One model's row: its title, how many are placed, which one is selected; opens into its instances. */
export function GroupRow({ group, expanded, selectedId, onToggle }: GroupRowProps) {
  const holdsSelection = group.instances.some((i) => i.id === selectedId);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-current={holdsSelection || undefined}
      aria-label={group.model.title}
      className={cx(
        "flex w-full cursor-pointer items-center gap-[9px] rounded-[9px] border px-[11px] py-[9px] text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        holdsSelection ? "border-accent bg-accent-soft" : "border-line bg-panel-2 hover:border-line-2",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px] text-fg">{group.model.title}</span>
        <span className="mt-[3px] block font-mono text-[9px] text-muted">{groupLine(group, selectedId)}</span>
      </span>
      <Icon
        name="chevron-right"
        size={12}
        className={cx("shrink-0 text-muted transition-transform duration-150", expanded && "rotate-90")}
      />
    </button>
  );
}
