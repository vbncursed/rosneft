import { clsx as cx } from "clsx";
import { grantAction, type AccessGrant } from "@/entities/territory";
import { Avatar } from "@/shared/ui/avatar";

export type GrantRowProps = {
  grant: AccessGrant;
  onRemove?: (userId: string) => void;
};

const ACTION_LABEL = { remove: "Remove", pinned: "pinned", locked: "locked" } as const;

const ACTION_SKIN = {
  remove: "cursor-pointer border-solid border-line-2 text-muted hover:text-fg",
  pinned: "border-solid border-accent text-accent",
  locked: "border-dashed border-line-2 text-dim",
} as const;

/** One person who can open the territory, and whether that can be taken away. */
export function GrantRow({ grant, onRemove }: GrantRowProps) {
  const action = grantAction(grant);
  const owner = grant.via === "owner";

  return (
    <div
      className={cx(
        "flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5",
        owner ? "border-accent-line bg-accent-soft" : "border-line bg-panel-2",
        grant.inactive && "opacity-60",
      )}
    >
      <Avatar
        name={grant.username}
        size={28}
        variant={owner ? "soft" : "plain"}
        className="text-[10px]"
      />

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-xs font-medium text-fg">{grant.username}</p>
        <p className="m-0 mt-px truncate font-mono text-[10px] text-dim">{grant.roleTitle}</p>
      </div>

      <span
        className={cx(
          "whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.14em]",
          grant.via === "direct" ? "text-accent" : "text-muted",
        )}
      >
        {grant.via === "direct" ? "direct" : grant.via === "owner" ? "owner" : "via role"}
      </span>

      <button
        type="button"
        disabled={action !== "remove"}
        onClick={() => onRemove?.(grant.userId)}
        aria-label={
          action === "remove"
            ? `Remove ${grant.username}'s access`
            : `${grant.username}'s access cannot be removed here`
        }
        className={cx(
          "whitespace-nowrap rounded-control-sm border bg-transparent px-2.5 py-[3px] font-mono text-[9px] uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed",
          ACTION_SKIN[action],
        )}
      >
        {ACTION_LABEL[action]}
      </button>
    </div>
  );
}
