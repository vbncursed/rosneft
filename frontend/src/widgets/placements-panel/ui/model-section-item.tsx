import { EyeButton, eyeState, groupLine, GroupRow, type ModelSection } from "@/entities/placement";
import { InstanceItem, type RowContext } from "./instance-item";

/**
 * One model's row: only the placements no group claims are listed, but its eye
 * covers every placement of the model, grouped ones too (G-3). The selection
 * wins over the open key, so a placement picked in the scene is reachable.
 */
export function ModelSectionItem({ section, ctx }: { section: ModelSection; ctx: RowContext }) {
  const { group, shown } = section;
  const all = group.instances.map((i) => i.id);
  const holdsSelection = shown.some((i) => i.id === ctx.selectedId);
  const open = ctx.expanded === group.model.slug || holdsSelection;
  return (
    <li>
      <GroupRow
        title={group.model.title}
        line={groupLine({ ...group, instances: shown }, ctx.selectedId)}
        expanded={open}
        holdsSelection={holdsSelection}
        onToggle={() => ctx.onToggleGroup(group.model.slug)}
        actions={
          ctx.grants.write ? (
            // ponytail: one request carries every id of the model, and the gateway
            // refuses more than 1000; chunk per 1000 if a territory ever gets there.
            <EyeButton
              state={eyeState(group.instances)}
              subject={`every ${group.model.title}`}
              disabled={all.some((id) => ctx.pendingIds.includes(id))}
              onToggle={(hidden) => ctx.onSetHidden(all, hidden)}
            />
          ) : undefined
        }
      />
      {open ? (
        <ul role="list" className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
          {shown.map((instance) => (
            <InstanceItem key={instance.id} model={group} instance={instance} ctx={ctx} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
