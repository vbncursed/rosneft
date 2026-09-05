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
  /** A system role, or a save in flight — the whole set is read-only. */
  readOnly?: boolean;
};

const LOCKED_TITLE = "You cannot grant a permission you do not have";

/** The four states a chip can be in, in the order they take precedence. */
type ChipState = "locked" | "system" | "on" | "off";

const CHIP: Record<ChipState, string> = {
  on: "cursor-pointer border-solid border-accent bg-accent-soft text-accent",
  off: "cursor-pointer border-solid border-line-2 text-muted hover:text-fg",
  locked: "cursor-not-allowed border-dashed border-line-2 text-dim",
  system: "cursor-not-allowed border-solid border-line text-dim opacity-50",
};

// The dot is the second cue, so state does not rest on the border alone. Warn
// on a locked chip is the design's signal that Root is needed to grant it.
const DOT: Record<ChipState, string> = {
  on: "bg-accent",
  off: "bg-line-2",
  locked: "bg-warn",
  system: "bg-line-2",
};

export function PermissionMatrix({
  all,
  granted,
  onToggle,
  grantable,
  readOnly = false,
}: PermissionMatrixProps) {
  const groups = groupPermissions(all);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const grantedHere = group.permissions.filter((p) => granted.includes(p.slug)).length;

        return (
          <div key={group.name}>
            <div className="flex items-baseline justify-between gap-2.5">
              <p className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
                {group.name}
              </p>
              <span className="font-mono text-[10px] text-muted">
                {grantedHere} / {group.permissions.length}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-[7px]">
              {group.permissions.map((permission) => {
                const locked = grantable ? !grantable.has(permission.slug) : false;
                const on = granted.includes(permission.slug);
                const state: ChipState = locked
                  ? "locked"
                  : readOnly
                    ? "system"
                    : on
                      ? "on"
                      : "off";

                return (
                  <button
                    key={permission.slug}
                    type="button"
                    disabled={state === "locked" || state === "system"}
                    onClick={() => onToggle(permission.slug)}
                    aria-pressed={on}
                    // The visible label is the action alone, so "write" appears
                    // once per group; the slug is what makes each chip's name
                    // unique and says which resource it belongs to.
                    aria-label={permission.slug}
                    title={locked ? LOCKED_TITLE : permission.description}
                    className={cx(
                      "inline-flex items-center gap-[7px] rounded-control border px-[11px] py-1.5 font-mono text-[11px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      CHIP[state],
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx("size-1.5 shrink-0 rounded-full", DOT[state])}
                    />
                    {actionOf(permission.slug)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
