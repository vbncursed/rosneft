import { useCallback, useState } from "react";
import type { Chain } from "@/entities/measurement";

export type ClearMeasurementsDeps = {
  chains: readonly Chain[];
  clear: (keepSaved: boolean) => void;
  /** `measurement:delete`: Clear then deletes the saved chains too, after asking. */
  canDeleteMeasurements: boolean;
};

export type ClearMeasurementsHandlers = {
  confirmClear: boolean;
  onClearMeasurements: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
};

/**
 * Clear's ask-first-when-saved-chains-exist dance, split out of
 * `usePageHandlers` at the 200-line cap. Saved chains are everyone's: they go
 * only with the grant, and only after asking; without it Clear takes the
 * reader's own chains and asks nothing.
 */
export function useClearMeasurements({
  chains,
  clear,
  canDeleteMeasurements,
}: ClearMeasurementsDeps): ClearMeasurementsHandlers {
  const [confirmClear, setConfirmClear] = useState(false);
  const hasSaved = chains.some((c) => c.serverId != null);

  const onClearMeasurements = useCallback(() => {
    if (canDeleteMeasurements && hasSaved) setConfirmClear(true);
    else clear(!canDeleteMeasurements);
  }, [canDeleteMeasurements, hasSaved, clear]);
  const onConfirmClear = useCallback(() => {
    setConfirmClear(false);
    clear(false);
  }, [clear]);
  const onCancelClear = useCallback(() => setConfirmClear(false), []);

  return { confirmClear, onClearMeasurements, onConfirmClear, onCancelClear };
}
