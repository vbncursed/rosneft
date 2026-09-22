import { clsx as cx } from "clsx";
import { actionOf, groupPermissions, type Permission } from "@/entities/permission";
import { Tooltip } from "@/shared/ui/tooltip";

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

/**
 * A chip is granted or not, and editable or not. A read-only role (a system
 * one, a reader without the grant, a save in flight) still shows which is
 * which: `held`/`absent`. `locked`/`lockedHeld` exist only on an editable role:
 * dashed means "you cannot change this", accent means "granted".
 */
type ChipState = "on" | "off" | "locked" | "lockedHeld" | "held" | "absent";

const PRESS = "cursor-pointer enabled:active:scale-[0.97]";

const CHIP: Record<ChipState, string> = {
  on: cx(PRESS, "border-solid border-accent bg-accent-soft text-accent"),
  off: cx(PRESS, "border-solid border-line-2 text-muted hover:text-fg"),
  locked: "cursor-not-allowed border-dashed border-line-2 text-dim",
  lockedHeld: "cursor-not-allowed border-dashed border-accent bg-accent-soft text-accent",
  held: "cursor-default border-solid border-accent bg-accent-soft text-accent",
  absent: "cursor-default border-solid border-line text-dim",
};

// The dot is the second cue, so state does not rest on the border alone. Warn
// on a locked chip is the design's signal that Root is needed to grant it; on
// a read-only role a filled dot is granted and a hollow ring is not.
const DOT: Record<ChipState, string> = {
  on: "bg-accent",
  off: "bg-line-2",
  locked: "bg-warn",
  lockedHeld: "bg-warn",
  held: "bg-accent",
  absent: "border border-dim",
};

function chipState(on: boolean, locked: boolean, readOnly: boolean): ChipState {
  if (readOnly) return on ? "held" : "absent";
  if (locked) return on ? "lockedHeld" : "locked";
  return on ? "on" : "off";
}

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
                const state = chipState(on, locked, readOnly);
                const isLocked = locked && !readOnly;
                const hint = isLocked ? LOCKED_TITLE : permission.description;

                const chip = (
                  <button
                    key={permission.slug}
                    type="button"
                    disabled={isLocked}
                    // Read-only chips stay focusable, so what they hold can
                    // still be read; they just do nothing when pressed.
                    aria-disabled={readOnly || undefined}
                    onClick={readOnly ? undefined : () => onToggle(permission.slug)}
                    aria-pressed={on}
                    // The visible label is the action alone, so "write" appears
                    // once per group; the slug is what makes each chip's name
                    // unique and says which resource it belongs to. A locked chip
                    // is disabled, so it never takes focus and its tooltip never
                    // describes it: the reason rides in the name instead.
                    aria-label={isLocked ? `${permission.slug} — ${LOCKED_TITLE.toLowerCase()}` : permission.slug}
                    className={cx(
                      "inline-flex items-center gap-[7px] rounded-control border px-[11px] py-1.5 font-mono text-[11px] transition-[color,background-color,border-color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
                return hint ? (
                  <Tooltip key={permission.slug} label={hint}>
                    {chip}
                  </Tooltip>
                ) : (
                  chip
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
