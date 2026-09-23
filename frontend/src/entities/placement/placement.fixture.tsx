import { useState } from "react";
import { groupByModel, type ModelGroup } from "./model/groups";
import { IDENTITY_TRANSFORM, type Placement } from "./model/placement";
import { GroupRow } from "./ui/group-row";
import { InstanceRow } from "./ui/instance-row";

const make = (id: number, modelSlug: string, label = ""): Placement => ({
  id,
  territorySlug: "refinery-block-c",
  modelSlug,
  label,
  updatedAt: "2026-08-31T14:02:00Z",
  visiblePanoramaIds: [4],
  hidden: false,
  groupId: null,
  ...IDENTITY_TRANSFORM,
});

const OPTIONS = [
  { slug: "tank", title: "storage-tank-500" },
  { slug: "pump", title: "Насос НМ-1250" },
];

const PLACEMENTS = [
  make(1, "tank"),
  make(2, "tank", "Tank 4, north row"),
  make(3, "tank"),
  make(7, "pump", "Pump house"),
];

const [TANKS, PUMPS] = groupByModel(PLACEMENTS, OPTIONS);

const noop = () => {};
const handlers = { onSelect: noop, onRename: noop, onDelete: noop, onFocus: noop };

const instance = (
  group: ModelGroup,
  index: number,
  props: { selected: boolean; pending: boolean; canWrite: boolean; canDelete: boolean },
) => <InstanceRow group={group} instance={group.instances[index]} {...props} {...handlers} />;

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
            group={group}
            expanded={open === group.model.slug}
            selectedId={selected}
            onToggle={() => setOpen((s) => (s === group.model.slug ? null : group.model.slug))}
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
                  onSelect={setSelected}
                  onRename={noop}
                  onDelete={noop}
                  onFocus={noop}
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
      <GroupRow group={TANKS} expanded={false} selectedId={null} onToggle={noop} />
      <GroupRow group={TANKS} expanded selectedId={2} onToggle={noop} />
      <GroupRow group={PUMPS} expanded={false} selectedId={null} onToggle={noop} />
    </Frame>
  ),
  "instance rows": (
    <Frame>
      {instance(TANKS, 1, { selected: true, pending: false, canWrite: true, canDelete: true })}
      {instance(TANKS, 0, { selected: false, pending: false, canWrite: true, canDelete: true })}
      {instance(TANKS, 2, { selected: false, pending: false, canWrite: true, canDelete: false })}
      {instance(TANKS, 0, { selected: false, pending: false, canWrite: false, canDelete: false })}
      {instance(TANKS, 1, { selected: true, pending: true, canWrite: true, canDelete: true })}
    </Frame>
  ),
};
