export {
  GROUP_TITLE_MAX,
  IDENTITY_TRANSFORM,
  isShownIn,
  isVisibleIn,
  toDegrees,
  toRadians,
  type Placement,
  type PlacementCreate,
  type PlacementGroup,
  type PlacementTransform,
  type PlacementUpdate,
  type ResolvedPlacement,
  type Vec3,
} from "./model/placement";
export { toPlacement } from "./api/to-placement";
export {
  createPlacements,
  deletePlacement,
  setPlacementsGroup,
  setPlacementsHidden,
  setPlacementVisibility,
  updatePlacement,
} from "./api/placements-gateway";
export {
  createPlacementGroup,
  deletePlacementGroup,
  renamePlacementGroup,
  toPlacementGroup,
} from "./api/placement-groups-gateway";
export {
  bulk,
  creating,
  idle,
  isCreating,
  isMutatingId,
  mutating,
  pendingIdsOf,
  type MutationState,
} from "./model/mutation-state";
export {
  DEFAULT_SCALE,
  groupByModel,
  groupLine,
  instanceLine,
  instanceName,
  matchesObjects,
  realWorldScale,
  type ModelGroup,
  type PlacementInstance,
} from "./model/groups";
export { GroupRow, type GroupRowProps } from "./ui/group-row";
export { InstanceRow, type InstanceRowProps } from "./ui/instance-row";
export {
  eyeState,
  groupPlacements,
  matchesUserGroup,
  userGroupKey,
  userGroupLine,
  type EyeState,
  type ModelSection,
  type PlacementSections,
  type UserGroupSection,
} from "./model/sections";
