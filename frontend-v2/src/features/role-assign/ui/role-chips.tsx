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
  addLabel = "+ add role",
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
            <button
              type="button"
              onClick={() => onRemove(role.slug)}
              aria-label={`Remove role ${role.title}`}
              className="cursor-pointer border-none bg-transparent p-0 leading-none text-accent transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              ×
            </button>
          )}
        </span>
      ))}

      {readOnly ? null : (
        <button
          type="button"
          onClick={onAdd}
          className="cursor-pointer rounded-[7px] border border-dashed border-line-2 bg-transparent px-[11px] py-[5px] font-mono text-[11px] text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {addLabel}
        </button>
      )}

      {roles.length === 0 && readOnly ? (
        <p className="m-0 font-mono text-[11px] text-dim">No roles granted.</p>
      ) : null}
    </div>
  );
}
