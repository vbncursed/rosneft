import type { ReactNode } from "react";
import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";

export type GroupRowProps = {
  title: string;
  /** The count line under the title — `groupLine` for a model, `userGroupLine` for a user group. */
  line: string;
  expanded: boolean;
  holdsSelection: boolean;
  onToggle: () => void;
  /** Beside the disclosure, never inside it: the eye, a user group's menu. Absent without placement:write. */
  actions?: ReactNode;
};

/** One group's row: a disclosure over its title and count, then its own controls. */
export function GroupRow({ title, line, expanded, holdsSelection, onToggle, actions }: GroupRowProps) {
  return (
    <div
      className={cx(
        "flex items-center gap-1 rounded-[9px] border",
        actions ? "pr-1.5" : null,
        holdsSelection ? "border-accent bg-accent-soft" : "border-line bg-panel-2 hover:border-line-2",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-current={holdsSelection || undefined}
        aria-label={title}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-[9px] rounded-[9px] border-none bg-transparent px-[11px] py-[9px] text-left transition-[scale] duration-150 ease-out active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px] text-fg">{title}</span>
          <span className="mt-[3px] block font-mono text-[9px] text-muted">{line}</span>
        </span>
        <Icon
          name="chevron-right"
          size={12}
          className={cx("shrink-0 text-muted transition-transform duration-150 ease-out motion-reduce:transition-none", expanded && "rotate-90")}
        />
      </button>
      {actions}
    </div>
  );
}
