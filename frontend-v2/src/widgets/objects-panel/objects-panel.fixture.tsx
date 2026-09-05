import { useState } from "react";
import { ObjectsPanel } from "./ui/objects-panel";
import type { Placement } from "@/entities/placement";

const make = (id: number, label: string, visiblePanoramaIds: number[] = []): Placement => ({
  id,
  territorySlug: "refinery-block-c",
  modelSlug: "pump-jack",
  label,
  updatedAt: "2026-08-31T14:02:00Z",
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  visiblePanoramaIds,
});

const PLACEMENTS = [
  make(1, "Pump Jack Unit", [4]),
  make(2, "Storage Tank 500", [4]),
  make(3, "Flare Stack A"),
];

function Live({ panorama }: { panorama: number | null }) {
  const [selected, setSelected] = useState<number | null>(2);
  return (
    <ObjectsPanel
      placements={PLACEMENTS}
      selectedId={selected}
      onSelect={setSelected}
      onRename={() => {}}
      onDelete={() => {}}
      activePanoramaId={panorama}
      onToggleVisible={panorama === null ? undefined : () => {}}
    />
  );
}

export default {
  scene: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <Live panorama={null} />
    </div>
  ),
  inPanorama: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <Live panorama={4} />
    </div>
  ),
  empty: (
    <div className="max-w-sm rounded-card border border-line bg-panel p-6">
      <ObjectsPanel
        placements={[]}
        selectedId={null}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    </div>
  ),
};
