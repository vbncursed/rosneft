import type { components } from "@/shared/api/dto";
import type { StoredChain } from "../model/measurement-reducer";

type MeasurementDto = components["schemas"]["Measurement"];

/** The one DTO→domain mapper for a saved chain: the scene bundle and the gateway answer the same shape. */
export const toStoredChain = (d: MeasurementDto): StoredChain => ({
  serverId: d.id,
  points: d.points,
  closed: d.closed,
});
