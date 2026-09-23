import { useEffect, useRef, useState } from "react";
import {
  EyeButton,
  eyeState,
  GroupRow,
  userGroupKey,
  userGroupLine,
  type UserGroupSection,
} from "@/entities/placement";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";
import { ADD_TO_GROUP, DELETE_GROUP } from "../model/panel-copy";
import { GroupTitleField } from "./group-title-field";
import { InstanceItem, type RowContext } from "./instance-item";

/** The three group writes, and whether one is in flight. All `placement:write` (G-5). */
export type GroupActions = {
  busy: boolean;
  onCreate: (title: string) => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
};

export type UserGroupItemProps = {
  section: UserGroupSection;
  ctx: RowContext;
  /** The group's own Add (G-4); null without placement:create or inside a panorama. */
  onAdd: ((groupId: number) => void) | null;
  actions: GroupActions;
};

/** One user group: its row (eye and menu for a writer), its members, then its own Add. */
export function UserGroupItem({ section, ctx, onAdd, actions }: UserGroupItemProps) {
  const [renaming, setRenaming] = useState(false);
  const item = useRef<HTMLLIElement>(null);
  const renamed = useRef(false);
  // The field leaves the DOM with its focus; hand it back to the row's disclosure,
  // the first expandable button (the kebab after it is one too).
  useEffect(() => {
    if (!renaming && renamed.current) item.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
  }, [renaming]);
  const stopRenaming = () => {
    renamed.current = true;
    setRenaming(false);
  };
  const { group, members } = section;
  const ids = members.map((m) => m.instance.id);
  const holdsSelection = ctx.selectedId !== null && ids.includes(ctx.selectedId);
  const open = ctx.expanded === userGroupKey(group.id) || holdsSelection;

  const row = renaming ? (
    <GroupTitleField
      label={`Rename group ${group.title}`}
      submitLabel="Save group title"
      initial={group.title}
      busy={actions.busy}
      onSubmit={(title) => {
        // The field hands over a trimmed title; an unchanged one is not a write.
        if (title !== group.title) actions.onRename(group.id, title);
        stopRenaming();
      }}
      onCancel={stopRenaming}
    />
  ) : (
    <GroupRow
      title={group.title}
      line={userGroupLine(section, ctx.selectedId)}
      expanded={open}
      holdsSelection={holdsSelection}
      onToggle={() => ctx.onToggleGroup(userGroupKey(group.id))}
      actions={
        ctx.grants.write ? (
          <>
            <EyeButton
              state={eyeState(members.map((m) => m.instance))}
              subject={`group ${group.title}`}
              disabled={ids.length === 0 || ids.some((id) => ctx.pendingIds.includes(id))}
              onToggle={(hidden) => ctx.onSetHidden(ids, hidden)}
            />
            <Menu
              triggerLabel={`Actions for group ${group.title}`}
              trigger={<Icon name="kebab" size={12} />}
              disabled={actions.busy}
              items={[
                { label: "Rename", onSelect: () => setRenaming(true) },
                { label: DELETE_GROUP, tone: "bad", onSelect: () => actions.onDelete(group.id) },
              ]}
            />
          </>
        ) : undefined
      }
    />
  );

  return (
    <li ref={item}>
      {row}
      {open ? (
        <ul role="list" className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
          {members.map(({ model, instance }) => (
            <InstanceItem key={instance.id} model={model} instance={instance} ctx={ctx} showModel />
          ))}
          {onAdd ? (
            <li className="ml-3">
              <Button variant="ghost" size="sm" aria-label={`Add objects to group ${group.title}`} onClick={() => onAdd(group.id)}>
                <Icon name="plus" size={12} />
                {ADD_TO_GROUP}
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
