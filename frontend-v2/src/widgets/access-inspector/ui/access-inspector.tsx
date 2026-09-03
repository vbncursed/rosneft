import {
  hasInheritedGrants,
  VISIBILITY_TITLE,
  type AccessGrant,
  type TerritoryAccess,
  type Visibility,
} from "@/entities/territory";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { RadioCards } from "@/shared/ui/radio-card";
import { GrantRow } from "./grant-row";

export type AccessInspectorProps = {
  territory: TerritoryAccess;
  visibility: Visibility;
  /** Absent when the gateway offers no switch — the visibility is then only shown. */
  onVisibilityChange?: (visibility: Visibility) => void;

  grants: AccessGrant[];
  onAddPerson: () => void;
  onRemoveGrant: (userId: string) => void;

  onClose: () => void;
  onCancel: () => void;
  onSave: () => void;
  /** Unsaved changes exist. */
  dirty?: boolean;
  saving?: boolean;
};

const INHERITED_NOTE = "Role-granted access can't be revoked here — change the role instead.";

const VISIBILITY_HINT: Record<Visibility, string> = {
  assigned: "Only listed accounts can open this territory.",
  company: "Every account in the company gets read access.",
  private: "Only Root can open it until someone is assigned.",
};

export function AccessInspector({
  territory,
  visibility,
  onVisibilityChange,
  grants,
  onAddPerson,
  onRemoveGrant,
  onClose,
  onCancel,
  onSave,
  dirty = false,
  saving = false,
}: AccessInspectorProps) {
  // With a switch, the people list only means anything for per-person
  // access. Without one, visibility is derived from the list itself, so the
  // list is always the thing to edit.
  const listsPeople = !onVisibilityChange || visibility === "assigned";

  return (
    <aside
      aria-label={`Access: ${territory.title}`}
      className="overflow-hidden rounded-[14px] border border-accent-line bg-panel shadow-elevation"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-accent-soft p-4.5">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">
            Manage access
          </p>
          <p className="m-0 mt-2 truncate text-base font-semibold text-fg">{territory.title}</p>
          <p className="m-0 mt-[3px] truncate font-mono text-[11px] text-muted">{territory.slug}</p>
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
          <p className="m-0 mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
            Visibility
          </p>
          {onVisibilityChange ? (
            <RadioCards
              label="Visibility"
              value={visibility}
              onChange={onVisibilityChange}
              options={(["assigned", "company", "private"] as const).map((value) => ({
                value,
                title: VISIBILITY_TITLE[value],
                hint: VISIBILITY_HINT[value],
              }))}
            />
          ) : (
            <p className="m-0 text-[13px] text-fg">
              {VISIBILITY_TITLE[visibility]}
              <span className="ml-2 text-[11px] text-muted">{VISIBILITY_HINT[visibility]}</span>
            </p>
          )}
        </div>

        {listsPeople ? (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
                With access · {grants.length}
              </p>
              <button
                type="button"
                onClick={onAddPerson}
                className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] text-accent transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                + add person
              </button>
            </div>

            <div className="mt-2.5 flex flex-col gap-[7px]">
              {grants.length === 0 ? (
                <p className="m-0 rounded-[9px] border border-dashed border-line-2 px-3 py-2.5 text-[11px] text-muted">
                  Nobody can open this territory yet.
                </p>
              ) : (
                grants.map((grant) => (
                  <GrantRow key={grant.userId} grant={grant} onRemove={onRemoveGrant} />
                ))
              )}
            </div>
          </div>
        ) : null}

        {listsPeople && hasInheritedGrants(grants) ? (
          <Callout tone="warn" icon="info">
            {INHERITED_NOTE}
          </Callout>
        ) : null}

        <div className="flex gap-2 border-t border-line pt-3.5">
          <Button
            size="sm"
            className="flex-1 justify-center"
            onClick={onCancel}
            disabled={!dirty || saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="flex-1 justify-center"
            onClick={onSave}
            loading={saving}
            disabled={!dirty}
          >
            Save access
          </Button>
        </div>
      </div>
    </aside>
  );
}
