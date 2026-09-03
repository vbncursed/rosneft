export { territoryPath, type Territory } from "./model/territory";
export { deleteTerritory, listTerritories } from "./api/territories-gateway";
export { territoriesQuery } from "./api/territories-query";
export {
  grantAction,
  hasInheritedGrants,
  isRevocable,
  VISIBILITY_TITLE,
  VISIBILITY_TONE,
  type AccessGrant,
  type GrantVia,
  type TerritoryAccess,
  type Visibility,
} from "./model/access";
export { AccessRow, type AccessRowProps, type AccessVia } from "./ui/access-row";
export { TerritoryAccessRow, type TerritoryAccessRowProps } from "./ui/territory-access-row";
export { TerritoryCard, type TerritoryCardProps } from "./ui/territory-card";
