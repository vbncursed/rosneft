import type { SceneBundle, SceneViewModel } from "@/entities/scene";
import { usePlacementGroups, usePlacementsEditor } from "@/features/placements-editor";

export type ViewerPlacementsParams = {
  slug: string;
  bundle: SceneBundle | undefined;
  vm: SceneViewModel | null;
  /** Panoramas a newly created object is visible in (spec §6.1: everywhere loaded). */
  panoramaIds: number[];
  onChanged: () => void;
};

/**
 * The placement editor and the territory's user groups, which share one list:
 * deleting a group ungroups its placements in the editor. Split out of
 * `useTerritoryViewer` at the 200-line cap; both seed from the bundle once.
 */
export function useViewerPlacements({ slug, bundle, vm, panoramaIds, onChanged }: ViewerPlacementsParams) {
  const dims = vm?.metadata.dims ?? { x: 0, y: 0, z: 0 };
  const editor = usePlacementsEditor({
    slug,
    initial: vm?.placements ?? [],
    options: bundle?.modelOptions ?? [],
    territoryMaxDim: Math.max(dims.x, dims.y, dims.z),
    panoramaIds,
    onChanged,
  });
  const groups = usePlacementGroups({
    slug,
    initial: bundle?.placementGroups ?? [],
    onChanged,
    onRemoved: editor.ungroup,
  });
  return { editor, groups };
}
