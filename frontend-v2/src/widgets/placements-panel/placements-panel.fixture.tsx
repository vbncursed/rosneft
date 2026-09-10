import { useState, type ReactNode } from "react";
import type { PlacementGroup, PlacementTransform } from "@/entities/placement";
import type { GizmoMode } from "@/features/viewer-mode";
import { PlacementsPanel } from "./ui/placements-panel";
import type { SelectedBlockProps } from "./ui/selected-block";

const GROUPS: PlacementGroup[] = [
  {
    model: { slug: "pipe-rack-12", title: "pipe-rack-12" },
    instances: [{ id: 11, index: 1, label: "west run" }],
  },
  {
    model: { slug: "storage-tank-500", title: "storage-tank-500" },
    instances: [
      { id: 1, index: 1, label: "" },
      { id: 2, index: 2, label: "north row" },
      { id: 3, index: 3, label: "" },
    ],
  },
];

const RU_GROUPS: PlacementGroup[] = [
  {
    model: { slug: "nasos-nm-1250", title: "Насос НМ-1250" },
    instances: [
      { id: 4, index: 1, label: "" },
      { id: 5, index: 2, label: "" },
    ],
  },
];

const TRANSFORM: PlacementTransform = {
  position: { x: 12.4, y: 0, z: -8.25 },
  rotation: { x: 0, y: Math.PI / 2, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const COMPACT_TRANSFORM: PlacementTransform = {
  position: { x: 6.4, y: 0, z: -3.1 },
  rotation: { x: 0, y: Math.PI / 12, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

/** The panel body it is rendered into: 320 open, 300 at 1280 and below. */
function Body({ width = 320, children }: { width?: number; children: ReactNode }) {
  return (
    <div className="p-6">
      <div
        style={{ width }}
        className="rounded-card border border-line bg-panel p-3.5 shadow-elevation"
      >
        {children}
      </div>
    </div>
  );
}

function Live({
  groups = GROUPS,
  grants,
  selectedId = null,
  selected,
  width,
}: {
  groups?: PlacementGroup[];
  grants: { create: boolean; write: boolean; delete: boolean };
  selectedId?: number | null;
  selected?: Omit<SelectedBlockProps, "gizmo" | "onGizmo" | "snap" | "onSnap"> | null;
  width?: number;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(groups[0]?.model.slug ?? null);
  const [id, setId] = useState<number | null>(selectedId);
  const [gizmo, setGizmo] = useState<GizmoMode>("translate");
  const [snap, setSnap] = useState(true);

  return (
    <Body width={width}>
      <PlacementsPanel
        groups={groups}
        query={query}
        onQuery={setQuery}
        expandedModel={expanded}
        onToggleGroup={(slug) => setExpanded((open) => (open === slug ? null : slug))}
        selectedId={id}
        onSelect={setId}
        pendingIds={[]}
        grants={grants}
        onAdd={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
        onFocus={() => {}}
        selected={selected ? { ...selected, gizmo, onGizmo: setGizmo, snap, onSnap: setSnap } : null}
      />
    </Body>
  );
}

const EDITOR = { create: true, write: true, delete: true };
const GUEST = { create: false, write: false, delete: false };
const NO_DELETE = { create: true, write: true, delete: false };

function Form({ saving }: { saving: boolean }) {
  const [label, setLabel] = useState("Tank 4, north row");
  const [transform, setTransform] = useState<PlacementTransform>({
    position: { x: 18.2, y: 0, z: -4.05 },
    rotation: { x: 0, y: Math.PI / 4, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  });
  return (
    <Live
      grants={EDITOR}
      selectedId={3}
      selected={{
        name: "storage-tank-500 #4",
        transform,
        canWrite: true,
        compact: false,
        form: {
          kind: "new",
          label,
          onLabel: setLabel,
          transform,
          onTransform: setTransform,
          saving,
          onSave: () => {},
          onCancel: () => {},
        },
      }}
    />
  );
}

export default {
  editor: (
    <Live
      grants={EDITOR}
      selectedId={2}
      selected={{
        name: "storage-tank-500 #2",
        transform: TRANSFORM,
        canWrite: true,
        compact: false,
        form: null,
      }}
    />
  ),
  guest: (
    <Live
      grants={GUEST}
      selectedId={2}
      selected={{
        name: "storage-tank-500 #2",
        transform: TRANSFORM,
        canWrite: false,
        compact: false,
        form: null,
      }}
    />
  ),
  "no-delete": <Live grants={NO_DELETE} />,
  empty: <Live grants={EDITOR} groups={[]} />,
  form: <Form saving={false} />,
  saving: <Form saving />,
  compact: (
    <Live
      width={300}
      grants={EDITOR}
      groups={RU_GROUPS}
      selectedId={4}
      selected={{
        name: "Насос НМ-1250 #1",
        transform: COMPACT_TRANSFORM,
        canWrite: true,
        compact: true,
        form: null,
      }}
    />
  ),
};
