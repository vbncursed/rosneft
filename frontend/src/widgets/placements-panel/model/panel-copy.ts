export type PlacementGrants = { create: boolean; write: boolean; delete: boolean };

export const ADD_LABEL = "Add objects to territory";

export const EMPTY_TITLE = "No objects placed yet";

export const EMPTY_BODY =
  "Pick models from the library and drop them onto the territory; each instance keeps its own position, rotation and scale.";

export const GUEST_FOOTER =
  "Placing, renaming and deleting objects need the editor role. Ask the territory owner for access.";

export const NO_DELETE_FOOTER = "Deleting placements needs the placement:delete grant.";

export const VISIBLE_IN = "Visible in";

export const VISIBLE_IN_NOTE =
  "Hidden objects stay in the 3D scene; only the panorama markers are dropped.";

export const NEW_GROUP = "New group";

/** Spec §1.5's own words: the group goes, what was in it does not. */
export const DELETE_GROUP = "Delete group (placements stay)";

export const ADD_TO_GROUP = "Add";

/**
 * The sentence under the list names what this reader cannot do — a viewer is
 * told the whole tab is read-only, an editor without the delete grant is told
 * only that. A reader who can do everything is told nothing.
 */
export function footerFor(grants: PlacementGrants): string | null {
  if (!grants.write && !grants.delete) return GUEST_FOOTER;
  if (!grants.delete) return NO_DELETE_FOOTER;
  return null;
}
