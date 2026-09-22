import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";

export type RoleChip = {
  slug: string;
  title: string;
};

export type RoleChipsProps = {
  roles: RoleChip[];
  onRemove: (slug: string) => void;
  onAdd: () => void;
  /** No write permission — the chips are shown, but not editable. */
  readOnly?: boolean;
  addLabel?: string;
};

/** The role editor: what is granted, and a way to grant more. */
export function RoleChips({
  roles,
  onRemove,
  onAdd,
  readOnly = false,
  addLabel = "add role",
}: RoleChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <span
          key={role.slug}
          className="inline-flex items-center gap-2 rounded-[7px] border border-accent bg-accent-soft px-[11px] py-[5px] font-mono text-[11px] text-accent"
        >
          {role.title}
          {readOnly ? null : (
            <Tooltip label={`Remove role ${role.title}`}>
              <button
                type="button"
                onClick={() => onRemove(role.slug)}
                aria-label={`Remove role ${role.title}`}
                className="flex cursor-pointer border-none bg-transparent p-0 text-accent transition-[color,scale] duration-150 ease-out hover:text-fg active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Icon name="close" size={11} />
              </button>
            </Tooltip>
          )}
        </span>
      ))}

      {readOnly ? null : (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-dashed border-line-2 bg-transparent px-[11px] py-[5px] font-mono text-[11px] text-muted transition-[color,scale] duration-150 ease-out hover:text-fg active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="plus" size={11} />
          {addLabel}
        </button>
      )}

      {roles.length === 0 && readOnly ? (
        <p className="m-0 font-mono text-[11px] text-dim">No roles granted.</p>
      ) : null}
    </div>
  );
}
