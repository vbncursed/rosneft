import { useState } from "react";
import { ObjectRow } from "./ui/object-row";
import type { Placement } from "./model/placement";

const make = (id: number, label: string): Placement => ({
  id,
  territorySlug: "refinery-block-c",
  modelSlug: "pump-jack",
  label,
  updatedAt: "2026-08-31T14:02:00Z",
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  visiblePanoramaIds: [4],
});

const PLACEMENTS = [make(1, "Pump Jack Unit"), make(2, "Storage Tank 500"), make(3, "Flare Stack A")];

function List() {
  const [selected, setSelected] = useState<number | null>(2);
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [visible, setVisible] = useState<Record<number, boolean>>({ 1: false, 2: true, 3: false });

  return (
    <div className="p-6 flex max-w-sm flex-col gap-3">
      {PLACEMENTS.map((placement) => (
        <ObjectRow
          key={placement.id}
          placement={{ ...placement, label: labels[placement.id] ?? placement.label }}
          selected={selected === placement.id}
          onSelect={setSelected}
          onRename={(id, label) => setLabels((l) => ({ ...l, [id]: label }))}
          onDelete={() => {}}
          visibleInPanorama={visible[placement.id]}
          onToggleVisible={(id, on) => setVisible((v) => ({ ...v, [id]: on }))}
        />
      ))}
      <p className="m-0 rounded-control border border-dashed border-line-2 px-3 py-[9px] text-[11px] text-muted">
        No objects on this territory yet.
      </p>
    </div>
  );
}

export default (
  <div className="rounded-card border border-line bg-panel p-6">
    <List />
  </div>
);
