import type { ReactNode } from "react";
import { usersLabel, type Role } from "@/entities/role";
import type { Permission } from "@/entities/permission";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { PermissionMatrix } from "@/widgets/permission-matrix";

export type RoleInspectorProps = {
  role: Role;
  onRename: (title: string) => void;
  onClose: () => void;

  all: Permission[];
  granted: string[];
  onToggle: (slug: string) => void;
  /** Slugs the signed-in actor may grant; the rest are locked. */
  grantable?: Set<string>;

  onReset: () => void;
  onSave: () => void;
  /** True while a save is in flight; also blocks editing. */
  saving?: boolean;
  /** The reader may not change roles at all — no grant, not a system role. */
  readOnly?: boolean;
  /**
   * Why this role cannot be saved even though it is editable — the gateway
   * would refuse the whole set. Shown as a bad-toned callout, and Save is off.
   */
  saveBlocked?: ReactNode;
  /** Unsaved changes exist. */
  dirty?: boolean;
};

const LOCKED_NOTE = "Locked chips need Root — you can't grant a permission you don't hold.";
const SYSTEM_NOTE = "System roles are defined by migrations and cannot be edited here.";
const NO_GRANT_NOTE = "You can view roles here, but changing one needs roles:manage.";

export function RoleInspector({
  role,
  onRename,
  onClose,
  all,
  granted,
  onToggle,
  grantable,
  onReset,
  onSave,
  saving = false,
  dirty = false,
  readOnly = false,
  saveBlocked,
}: RoleInspectorProps) {
  // A system role is defined by migrations; its set is shown, never edited.
  const locked = readOnly || role.kind === "system" || saving;
  // Why there is nothing to press. The role being immutable and the reader
  // lacking the grant are different sentences; a save that only earns a 403
  // is not drawn either way.
  const notice = role.kind === "system" ? SYSTEM_NOTE : readOnly ? NO_GRANT_NOTE : null;
  const hasLocked = grantable ? all.some((p) => !grantable.has(p.slug)) : false;
  const share = all.length === 0 ? 0 : Math.round((granted.length / all.length) * 100);

  return (
    <aside
      aria-label={`Role: ${role.title}`}
      className="overflow-hidden rounded-[14px] border border-accent-line bg-panel shadow-elevation"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-accent-soft p-4.5">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">
            {locked ? "Viewing role" : "Editing role"}
          </p>
          <input
            value={role.title}
            onChange={(e) => onRename(e.target.value)}
            readOnly={locked}
            aria-label="Role name"
            className="mt-2 w-full border-0 border-b border-solid border-accent-line bg-transparent py-[3px] font-sans text-lg font-semibold tracking-[-0.01em] text-fg outline-none read-only:cursor-default"
          />
          <p className="m-0 mt-1.5 font-mono text-[11px] text-muted">
            {role.slug} · {usersLabel(role)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer border-none bg-transparent p-0 leading-none text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4.5 p-4.5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Granted</p>
            <p className="m-0 font-mono text-[11px] text-accent">
              {granted.length} / {all.length}
            </p>
          </div>
          <ProgressBar
            className="mt-2.5"
            variant="thin"
            value={share}
            ariaLabel={`${role.title} permissions granted`}
          />
        </div>

        <PermissionMatrix
          all={all}
          granted={granted}
          onToggle={onToggle}
          grantable={grantable}
          readOnly={locked}
        />

        {/* The blocked-save callout already says a grant is out of reach, in
            stronger words — two notices about the same chips is one too many. */}
        {saveBlocked ? (
          <Callout tone="bad" icon="lock">
            {saveBlocked}
          </Callout>
        ) : hasLocked && !locked ? (
          <Callout tone="warn" icon="lock">
            {LOCKED_NOTE}
          </Callout>
        ) : null}

        {notice ? (
          <Callout tone="accent" icon="lock">
            {notice}
          </Callout>
        ) : (
          <div className="flex gap-2 border-t border-line pt-3.5">
            <Button
              size="sm"
              className="flex-1 justify-center"
              onClick={onReset}
              disabled={!dirty || saving}
            >
              Reset
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="flex-1 justify-center"
              onClick={onSave}
              loading={saving}
              disabled={!dirty || !!saveBlocked}
            >
              Save permissions
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
