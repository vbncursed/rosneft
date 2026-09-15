import {
  instanceName,
  type PlacementGroup,
  type ResolvedPlacement,
} from "@/entities/placement";
import { groupDigits, type SceneViewModel } from "@/entities/scene";
import type { Detail } from "@/shared/ui/detail-list";
import type { PlacementVisibility, SelectedBlockProps } from "@/widgets/placements-panel";
import { uploadedLine } from "./viewer-view";
import type { PageParts } from "./viewer-props";

/**
 * The blocks the View and Placements tabs are built from, split out of
 * `page-props.ts` at the 200-line cap.
 */

/**
 * The View tab's key/value block: what this territory is, in the mock's order.
 *
 * Inside a panorama the mesh's own counts go (state 8): the reader is looking
 * at a photograph, and how many triangles the territory has is a fact about
 * something that is no longer on screen.
 */
export const detailsOf = (slug: string, vm: SceneViewModel, inside = false): Detail[] => [
  { label: "slug", value: slug, tone: "accent" },
  { label: "units", value: vm.metadata.units },
  ...(inside
    ? []
    : [
        { label: "vertices", value: groupDigits(vm.metadata.vertices) },
        { label: "faces", value: groupDigits(vm.metadata.faces) },
      ]),
  { label: "uploaded", value: uploadedLine(vm.metadata.uploadedAt), tone: "muted" as const },
];

/**
 * The block under the object list. Its name comes from the grouped list rather
 * than the placement's own label, so the scene and the panel call the same
 * instance the same thing — `storage-tank-500 #1`, numbered by creation order.
 */
export function selectedBlock(
  p: PageParts,
  groups: PlacementGroup[],
  selected: ResolvedPlacement | null,
): SelectedBlockProps | null {
  if (!selected) return null;
  const group = groups.find((g) => g.model.slug === selected.modelSlug);
  const instance = group?.instances.find((i) => i.id === selected.id);
  if (!group || !instance) return null;

  return {
    name: instanceName(group, instance),
    gizmo: p.mode.gizmo,
    onGizmo: p.on.onGizmo,
    transform: { position: selected.position, rotation: selected.rotation, scale: selected.scale },
    snap: p.mode.snap,
    onSnap: p.on.onSnap,
    canWrite: p.grants.write,
    form: p.form,
    compact: p.view.compact,
  };
}

/**
 * The selected instance's per-panorama allowlist, under its row.
 *
 * Drawn wherever a placement is selected and the territory has captures — mock
 * state 13 draws it in the 3D scene, and its own footer says why: "Hidden
 * objects stay in the 3D scene; only the panorama markers are dropped." The
 * question is which captures mark this object, not what is on screen now. With
 * no captures at all there is nothing to ask.
 */
export function visibilityBlock(
  p: PageParts,
  selected: ResolvedPlacement | null,
): PlacementVisibility | null {
  if (!selected || p.panoramas.list.length === 0) return null;
  return {
    panoramas: p.panoramas.list.map((x) => ({ id: x.id, title: x.title })),
    visiblePanoramaIds: selected.visiblePanoramaIds,
    onToggle: p.on.onVisibility,
  };
}
