import { useCallback } from "react";
import type { Vec3 } from "@/entities/placement";
import { placementsInside, sizeCheck, zoneAxis, zoneCentre, type Zone } from "@/entities/zone";
import type { PlacementOrigin } from "@/features/placements-editor";

export type ZoneEquipmentParams = {
  zone: Zone | null;
  placements: { position: Vec3; hidden: boolean }[];
  /** Metres per scene unit, as `computeUnitRatio` gives it. */
  unitRatio: number;
  create: (modelSlug: string, count: number, groupId: number | null, origin: PlacementOrigin) => Promise<unknown>;
};

/** What the zone panel shows about one zone, and the placing that starts from its centre. */
export function useZoneEquipment({ zone, placements, unitRatio, create }: ZoneEquipmentParams) {
  const onPlace = useCallback(
    (modelSlug: string, count: number) => {
      if (!zone) return;
      void create(modelSlug, count, null, { position: zoneCentre(zone), yaw: zoneAxis(zone) });
    },
    [zone, create],
  );
  return {
    sizeLine: zone ? sizeCheck(zone, unitRatio) : null,
    inside: zone ? placementsInside(zone, placements) : 0,
    onPlace,
  };
}
