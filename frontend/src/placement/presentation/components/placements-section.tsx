import { useCallback, useMemo } from "react";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { PlacementUpdate } from "@/placement/domain/placement";
import { isCreating, isMutatingId } from "@/placement/domain/mutation-state";
import type { usePlacementsEditor } from "@/placement/application/use-placements-editor";
import CreatePlacementRow from "@/placement/presentation/components/create-placement-row";
import ModeToggle from "@/placement/presentation/components/mode-toggle";
import ObjectsList from "@/placement/presentation/components/objects-list";
import PlacementForm from "@/placement/presentation/components/placement-form";
import SnapToggle from "@/placement/presentation/components/snap-toggle";

interface PlacementsSectionProps {
  editor: ReturnType<typeof usePlacementsEditor>;
  assets: PlacementAssetOption[];
  // When a panorama is active, the list gains a per-object "show here" toggle
  // and new placements are auto-added to its allowlist.
  activePanoramaId: number | null;
  snapEnabled: boolean;
  onToggleSnap: (enabled: boolean) => void;
}

// PlacementsSection is the body of the overlays panel's "Placements" tab: the
// create row, the gizmo mode/snap controls (shown once a placement is
// selected), the territory objects list (name + per-panorama visibility), and
// the transform form for the selected object.
export default function PlacementsSection({
  editor,
  assets,
  activePanoramaId,
  snapEnabled,
  onToggleSnap,
}: PlacementsSectionProps) {
  const { placements, mutation, selectedId, mode } = editor;

  const isPending = useCallback(
    (id: number) => isMutatingId(mutation, id),
    [mutation],
  );

  const selected = useMemo(
    () => placements.find((p) => p.id === selectedId) ?? null,
    [placements, selectedId],
  );

  const handleFormSave = useCallback(
    (body: PlacementUpdate) => {
      if (!selected) return;
      return editor.update(selected.id, body);
    },
    [editor, selected],
  );

  const handleCreate = useCallback(
    (modelSlug: string) =>
      editor.create(
        modelSlug,
        activePanoramaId != null ? [activePanoramaId] : undefined,
      ),
    [editor, activePanoramaId],
  );

  const handleToggleVisible = useCallback(
    (id: number, visible: boolean) => {
      if (activePanoramaId == null) return;
      const current = placements.find((p) => p.id === id);
      if (!current) return;
      const next = visible
        ? [...new Set([...current.visiblePanoramaIds, activePanoramaId])]
        : current.visiblePanoramaIds.filter((v) => v !== activePanoramaId);
      editor.setVisibility(id, next);
    },
    [editor, placements, activePanoramaId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CreatePlacementRow
        assets={assets}
        disabled={isCreating(mutation)}
        onCreate={handleCreate}
      />

      {selectedId != null ? (
        <div className="flex flex-col gap-2">
          <ModeToggle mode={mode} onChange={editor.setMode} />
          <SnapToggle enabled={snapEnabled} onChange={onToggleSnap} />
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-white/15 px-3 py-2 text-[11px] text-neutral-400">
          Name an object below or click it to enable the gizmo.
        </p>
      )}

      <div className="flex-1 overflow-y-auto pr-1">
        <ObjectsList
          placements={placements}
          selectedId={selectedId}
          activePanoramaId={activePanoramaId}
          isPending={isPending}
          onSelect={editor.setSelectedId}
          onRename={editor.rename}
          onToggleVisible={handleToggleVisible}
          onDelete={editor.remove}
        />
      </div>

      {selected ? (
        <PlacementForm
          key={`${selected.id}:${selected.updatedAt}`}
          placement={selected}
          pending={isMutatingId(mutation, selected.id)}
          onSave={handleFormSave}
        />
      ) : null}
    </div>
  );
}
