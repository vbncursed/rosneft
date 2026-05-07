import { useCallback, useMemo, useState } from "react";
import type { GizmoMode } from "@/placement/domain/gizmo-mode";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type {
  PlacementUpdate,
  ResolvedPlacement,
} from "@/placement/domain/placement";
import {
  isCreating,
  isMutatingId,
  type MutationState,
} from "@/placement/domain/mutation-state";
import CreatePlacementRow from "@/placement/presentation/components/create-placement-row";
import EmptyState from "@/placement/presentation/components/empty-state";
import ModeToggle from "@/placement/presentation/components/mode-toggle";
import PlacementForm from "@/placement/presentation/components/placement-form";
import PlacementRow from "@/placement/presentation/components/placement-row";

interface PlacementsPanelProps {
  placements: ResolvedPlacement[];
  assets: PlacementAssetOption[];
  mutation: MutationState;
  errorMessage: string | null;
  selectedId: number | null;
  mode: GizmoMode;
  onSelect: (id: number | null) => void;
  onModeChange: (mode: GizmoMode) => void;
  onCreate: (assetSlug: string) => Promise<void> | void;
  onUpdate: (id: number, body: PlacementUpdate) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
}

export default function PlacementsPanel({
  placements,
  assets,
  mutation,
  errorMessage,
  selectedId,
  mode,
  onSelect,
  onModeChange,
  onCreate,
  onUpdate,
  onDelete,
}: PlacementsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const selected = useMemo(
    () => placements.find((p) => p.id === selectedId) ?? null,
    [placements, selectedId],
  );

  const handleExpand = useCallback(() => setCollapsed(false), []);
  const handleCollapse = useCallback(() => setCollapsed(true), []);
  const handleFormSave = useCallback(
    (body: PlacementUpdate) => {
      if (!selected) return;
      return onUpdate(selected.id, body);
    },
    [onUpdate, selected],
  );

  if (collapsed) {
    return (
      <div className="pointer-events-auto self-end">
        <button
          type="button"
          onClick={handleExpand}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-l-xl border border-r-0 border-white/20 bg-black/55 px-3 text-xs uppercase tracking-wider text-neutral-200 backdrop-blur transition-colors hover:bg-black/70"
          aria-label="Expand placements panel"
        >
          <span aria-hidden="true">{"‹"}</span>
          <span>Placements ({placements.length})</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="pointer-events-auto flex h-full w-[340px] flex-col gap-3 rounded-2xl border border-white/15 bg-black/55 p-4 text-neutral-100 shadow-2xl backdrop-blur-md">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
            overlays
          </p>
          <h2 className="text-sm font-semibold tracking-tight">Placements</h2>
        </div>
        <button
          type="button"
          onClick={handleCollapse}
          className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/10"
          aria-label="Collapse placements panel"
        >
          ›
        </button>
      </header>

      <CreatePlacementRow
        assets={assets}
        disabled={isCreating(mutation)}
        onCreate={onCreate}
      />

      {selectedId != null ? (
        <ModeToggle mode={mode} onChange={onModeChange} />
      ) : (
        <p className="rounded-md border border-dashed border-white/15 px-3 py-2 text-[11px] text-neutral-400">
          Click a placement in the list or in the scene to enable the gizmo.
        </p>
      )}

      {errorMessage ? (
        <p className="rounded-md border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {errorMessage}
        </p>
      ) : null}

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
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <PlacementForm
          // Re-key on every server-acknowledged change so a successful drag
          // refreshes the inputs to the new canonical values without
          // overwriting an in-progress edit on a different row.
          key={`${selected.id}:${selected.updatedAt}`}
          placement={selected}
          pending={isMutatingId(mutation, selected.id)}
          onSave={handleFormSave}
        />
      ) : null}
    </aside>
  );
}
