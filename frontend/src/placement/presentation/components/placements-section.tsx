import { useCallback, useMemo } from "react";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { PlacementUpdate } from "@/placement/domain/placement";
import type { Panorama } from "@/panorama/domain/panorama";
import { isCreating, isMutatingId } from "@/placement/domain/mutation-state";
import type { usePlacementsEditor } from "@/placement/application/use-placements-editor";
import CreatePlacementRow from "@/placement/presentation/components/create-placement-row";
import EmptyState from "@/placement/presentation/components/empty-state";
import ModeToggle from "@/placement/presentation/components/mode-toggle";
import PlacementForm from "@/placement/presentation/components/placement-form";
import PlacementRow from "@/placement/presentation/components/placement-row";
import PlacementVisibility from "@/placement/presentation/components/placement-visibility";
import SnapToggle from "@/placement/presentation/components/snap-toggle";

interface PlacementsSectionProps {
  editor: ReturnType<typeof usePlacementsEditor>;
  assets: PlacementAssetOption[];
  panoramas: Panorama[];
  // When a panorama is active, a freshly-created placement is auto-added to
  // its allowlist so it shows where it was dropped.
  activePanoramaId: number | null;
  snapEnabled: boolean;
  onToggleSnap: (enabled: boolean) => void;
}

// PlacementsSection is the body of the overlays panel's "Placements" tab —
// the create row, the gizmo mode/snap controls (shown once a placement is
// selected), the scrollable list, and the edit form. The tabbed panel shell
// (OverlaysPanel) owns the chrome; this component owns only the content.
export default function PlacementsSection({
  editor,
  assets,
  panoramas,
  activePanoramaId,
  snapEnabled,
  onToggleSnap,
}: PlacementsSectionProps) {
  const { placements, mutation, selectedId, mode } = editor;

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
          Click a placement in the list or in the scene to enable the gizmo.
        </p>
      )}

      <div className="flex-1 overflow-y-auto pr-1">
        {placements.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-2">
            {placements.map((p) => (
              <li key={p.id}>
                <PlacementRow
                  placement={p}
                  selected={p.id === selectedId}
                  pending={isMutatingId(mutation, p.id)}
                  onSelect={editor.setSelectedId}
                  onDelete={editor.remove}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <div className="flex flex-col gap-2">
          <PlacementForm
            key={`${selected.id}:${selected.updatedAt}`}
            placement={selected}
            pending={isMutatingId(mutation, selected.id)}
            onSave={handleFormSave}
          />
          <PlacementVisibility
            panoramas={panoramas}
            visibleIds={selected.visiblePanoramaIds}
            pending={isMutatingId(mutation, selected.id)}
            onChange={(ids) => editor.setVisibility(selected.id, ids)}
          />
        </div>
      ) : null}
    </div>
  );
}
