import { useState } from "react";
import { groupByModel, groupLine, type ModelGroup } from "./model/groups";
import { IDENTITY_TRANSFORM, type Placement } from "./model/placement";
import { eyeState } from "./model/sections";
import { EyeButton } from "./ui/eye-button";
import { GroupRow } from "./ui/group-row";
import { InstanceRow } from "./ui/instance-row";

const make = (id: number, modelSlug: string, label = "", over: Partial<Placement> = {}): Placement => ({
  id,
  territorySlug: "refinery-block-c",
  modelSlug,
  label,
  updatedAt: "2026-08-31T14:02:00Z",
  visiblePanoramaIds: [4],
  hidden: false,
  groupId: null,
  ...IDENTITY_TRANSFORM,
  ...over,
});

const OPTIONS = [
  { slug: "tank", title: "storage-tank-500" },
  { slug: "pump", title: "Насос НМ-1250" },
];

const GROUPS = [{ id: 1, title: "North yard" }];

const PLACEMENTS = [
  make(1, "tank"),
  make(2, "tank", "Tank 4, north row", { groupId: 1 }),
  make(3, "tank", "", { hidden: true }),
  make(7, "pump", "Pump house"),
];

const [TANKS, PUMPS] = groupByModel(PLACEMENTS, OPTIONS);

const noop = () => {};
const handlers = { onSelect: noop, onRename: noop, onDelete: noop, onFocus: noop, onHide: noop, onMove: noop };

const instance = (
  group: ModelGroup,
  index: number,
  props: { selected: boolean; pending: boolean; canWrite: boolean; canDelete: boolean },
) => <InstanceRow group={group} instance={group.instances[index]} groups={GROUPS} {...props} {...handlers} />;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="p-6">
    <div className="flex max-w-sm flex-col gap-2 rounded-card border border-line bg-panel p-4">{children}</div>
  </div>
);

function Panel() {
  const [open, setOpen] = useState<string | null>("tank");
  const [selected, setSelected] = useState<number | null>(2);
  return (
    <Frame>
      {[TANKS, PUMPS].map((group) => (
        <div key={group.model.slug} className="flex flex-col gap-2">
          <GroupRow
            title={group.model.title}
            line={groupLine(group, selected)}
            expanded={open === group.model.slug}
            holdsSelection={group.instances.some((i) => i.id === selected)}
            onToggle={() => setOpen((s) => (s === group.model.slug ? null : group.model.slug))}
            actions={<EyeButton state={eyeState(group.instances)} subject={`every ${group.model.title}`} onToggle={noop} />}
          />
          {open === group.model.slug
            ? group.instances.map((i) => (
                <InstanceRow
                  key={i.id}
                  group={group}
                  instance={i}
                  selected={selected === i.id}
                  pending={false}
                  canWrite
                  canDelete
                  groups={GROUPS}
                  {...handlers}
                  onSelect={setSelected}
                />
              ))
            : null}
        </div>
      ))}
    </Frame>
  );
}

export default {
  panel: <Panel />,
  "group rows": (
    <Frame>
      <GroupRow title="storage-tank-500" line={groupLine(TANKS, null)} expanded={false} holdsSelection={false} onToggle={noop} />
      <GroupRow
        title="storage-tank-500"
        line={groupLine(TANKS, 2)}
        expanded
        holdsSelection
        onToggle={noop}
        actions={<EyeButton state="mixed" subject="every storage-tank-500" onToggle={noop} />}
      />
      <GroupRow
        title="Насос НМ-1250"
        line={groupLine(PUMPS, null)}
        expanded={false}
        holdsSelection={false}
        onToggle={noop}
        actions={<EyeButton state="hidden" subject="every Насос НМ-1250" onToggle={noop} />}
      />
    </Frame>
  ),
  "instance rows": (
    <Frame>
      {instance(TANKS, 1, { selected: true, pending: false, canWrite: true, canDelete: true })}
      {instance(TANKS, 0, { selected: false, pending: false, canWrite: true, canDelete: true })}
      {instance(TANKS, 2, { selected: false, pending: false, canWrite: true, canDelete: false })}
      {instance(TANKS, 2, { selected: false, pending: false, canWrite: false, canDelete: false })}
      {instance(TANKS, 1, { selected: true, pending: true, canWrite: true, canDelete: true })}
    </Frame>
  ),
};
