export { territoryPath, type Territory } from "./model/territory";
export { toTerritoryCard, type TerritoryCardModel } from "./model/territory-card";
export { TerritoryCard, type TerritoryCardProps } from "./ui/territory-card";
export {
  createTerritory,
  deleteTerritory,
  getTerritory,
  listTerritories,
  replaceTerritorySource,
  updateTerritory,
  type CreateTerritoryInput,
} from "./api/territories-gateway";
export { toTerritory } from "./api/to-territory";
export { territoriesQuery } from "./api/territories-query";
export { territoryQuery } from "./api/territory-query";
export { getTerritoryAdmins, setTerritoryAdmins } from "./api/admins-gateway";
export { adminsQuery } from "./api/admins-query";
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
