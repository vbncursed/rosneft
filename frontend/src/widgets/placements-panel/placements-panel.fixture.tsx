import { useState, type ReactNode } from "react";
import { groupByModel, groupPlacements, IDENTITY_TRANSFORM, type Placement, type PlacementGroup, type PlacementSections, type PlacementTransform } from "@/entities/placement";
import type { GizmoMode } from "@/features/viewer-mode";
import { PlacementsPanel, type PlacementVisibility } from "./ui/placements-panel";
import type { SelectedBlockProps } from "./ui/selected-block";

const make = (id: number, modelSlug: string, label = "", over: Partial<Placement> = {}): Placement => ({
  id, territorySlug: "refinery-block-c", modelSlug, label, updatedAt: "", visiblePanoramaIds: [], hidden: false, groupId: null, ...IDENTITY_TRANSFORM, ...over,
});
const OPTIONS = [
  { slug: "pipe-rack-12", title: "pipe-rack-12" },
  { slug: "storage-tank-500", title: "storage-tank-500" },
  { slug: "nasos-nm-1250", title: "Насос НМ-1250" },
];
const sectionsOf = (placements: Placement[], groups: PlacementGroup[] = []): PlacementSections =>
  groupPlacements(groupByModel(placements, OPTIONS), groups);

const SECTIONS = sectionsOf([make(11, "pipe-rack-12", "west run"), make(1, "storage-tank-500"), make(2, "storage-tank-500", "north row"), make(3, "storage-tank-500")]);
const RU_SECTIONS = sectionsOf([make(4, "nasos-nm-1250"), make(5, "nasos-nm-1250")]);
const GROUPED = sectionsOf(
  [make(11, "pipe-rack-12", "west run", { groupId: 1 }), make(1, "storage-tank-500", "", { groupId: 1, hidden: true }), make(2, "storage-tank-500", "north row"), make(3, "storage-tank-500", "", { hidden: true })],
  [{ id: 1, title: "West yard" }, { id: 2, title: "Spare parts" }],
);

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
  sections = SECTIONS,
  grants,
  selectedId = null,
  selected,
  width,
  visibility,
}: {
  sections?: PlacementSections;
  grants: { create: boolean; write: boolean; delete: boolean };
  selectedId?: number | null;
  selected?: Omit<SelectedBlockProps, "gizmo" | "onGizmo" | "snap" | "onSnap"> | null;
  width?: number;
  /** Panorama mode only: the checkbox list under the selected row, live-editable. */
  visibility?: Pick<PlacementVisibility, "panoramas" | "visiblePanoramaIds">;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(sections.modelGroups[0]?.group.model.slug ?? null);
  const [id, setId] = useState<number | null>(selectedId);
  const [gizmo, setGizmo] = useState<GizmoMode>("translate");
  const [snap, setSnap] = useState(true);
  const [visibleIds, setVisibleIds] = useState<number[]>(visibility?.visiblePanoramaIds ?? []);

  return (
    <Body width={width}>
      <PlacementsPanel
        sections={sections}
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
        onSetHidden={() => {}}
        onMoveToGroup={() => {}}
        onAddToGroup={() => {}}
        groupActions={{ busy: false, onCreate: () => {}, onRename: () => {}, onDelete: () => {} }}
        selected={selected ? { ...selected, gizmo, onGizmo: setGizmo, snap, onSnap: setSnap } : null}
        visibility={
          visibility
            ? {
                panoramas: visibility.panoramas,
                visiblePanoramaIds: visibleIds,
                onToggle: (_placementId, panoramaId, next) =>
                  setVisibleIds((prev) =>
                    next ? [...prev, panoramaId] : prev.filter((existing) => existing !== panoramaId),
                  ),
              }
            : null
        }
      />
    </Body>
  );
}

const EDITOR = { create: true, write: true, delete: true };
const GUEST = { create: false, write: false, delete: false };
const NO_DELETE = { create: true, write: true, delete: false };

// Mock state 13: two panoramas, the selected instance visible in the first only.
const PANORAMAS = [
  { id: 1, title: "Control room, north door" },
  { id: 2, title: "Tank yard, west gate" },
];

const NEW_TRANSFORM: PlacementTransform = {
  position: { x: 18.2, y: 0, z: -4.05 },
  rotation: { x: 0, y: Math.PI / 4, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

/**
 * Every writable selection is a draft — `edit` is the block's resting state,
 * `new` the one the picker opens — so all four writer states below are this.
 */
function Form({
  kind,
  saving = false,
  name = "storage-tank-500 #4",
  selectedId = 3,
  start = NEW_TRANSFORM,
  initialLabel = "Tank 4, north row",
  sections,
  width,
  compact = false,
}: {
  kind: "new" | "edit";
  saving?: boolean;
  name?: string;
  selectedId?: number;
  start?: PlacementTransform;
  initialLabel?: string;
  sections?: PlacementSections;
  width?: number;
  compact?: boolean;
}) {
  const [label, setLabel] = useState(kind === "new" ? "" : initialLabel);
  const [transform, setTransform] = useState<PlacementTransform>(start);
  return (
    <Live
      grants={EDITOR}
      sections={sections}
      width={width}
      selectedId={selectedId}
      selected={{
        name,
        transform,
        canWrite: true,
        compact,
        form: {
          kind,
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
    <Form kind="edit" name="storage-tank-500 #2" selectedId={2} start={TRANSFORM} initialLabel="north row" />
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
  "visible-in": (
    <Live
      grants={NO_DELETE}
      selectedId={2}
      visibility={{ panoramas: PANORAMAS, visiblePanoramaIds: [1] }}
    />
  ),
  empty: <Live grants={EDITOR} sections={{ userGroups: [], modelGroups: [] }} />,
  form: <Form kind="new" />,
  groups: <Live grants={EDITOR} sections={GROUPED} selectedId={2} />,
  "groups, guest": <Live grants={GUEST} sections={GROUPED} />,
  saving: <Form kind="new" saving />,
  compact: (
    <Form
      kind="edit"
      name="Насос НМ-1250 #1"
      selectedId={4}
      start={COMPACT_TRANSFORM}
      initialLabel=""
      sections={RU_SECTIONS}
      width={300}
      compact
    />
  ),
};
