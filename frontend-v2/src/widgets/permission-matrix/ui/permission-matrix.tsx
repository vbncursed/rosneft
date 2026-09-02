import { clsx as cx } from "clsx";
import { actionOf, groupPermissions, type Permission } from "@/entities/permission";

export type PermissionMatrixProps = {
  all: Permission[];
  /** Slugs currently granted. */
  granted: string[];
  onToggle: (slug: string) => void;
  /**
   * Slugs the signed-in actor may grant. Anything outside it is locked: you
   * cannot hand out a permission you do not hold yourself.
   */
  grantable?: Set<string>;
  /** Locks the whole matrix — no write access, or a save in flight. */
  disabled?: boolean;
};

const LOCKED_TITLE = "You cannot grant a permission you do not have";

export function PermissionMatrix({
  all,
  granted,
  onToggle,
  grantable,
  disabled = false,
}: PermissionMatrixProps) {
  const groups = groupPermissions(all);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.name}>
          <p className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
            {group.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-[7px]">
            {group.permissions.map((permission) => {
              const on = granted.includes(permission.slug);
              const locked = grantable ? !grantable.has(permission.slug) : false;

              return (
                <button
                  key={permission.slug}
                  type="button"
                  disabled={disabled || locked}
                  onClick={() => onToggle(permission.slug)}
                  aria-pressed={on}
                  title={locked ? LOCKED_TITLE : permission.description}
                  className={cx(
                    "rounded-[7px] border px-2.5 py-[5px] font-mono text-[11px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    locked
                      ? "cursor-not-allowed border-dashed border-line-2 text-dim"
                      : disabled
                        ? "cursor-not-allowed border-line-2 text-muted opacity-40"
                        : on
                          ? "cursor-pointer border-accent bg-accent-soft text-accent"
                          : "cursor-pointer border-line-2 text-muted hover:text-fg",
                  )}
                >
                  {actionOf(permission.slug)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
