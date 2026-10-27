import { useCallback, useMemo, useState } from "react";
import type { Zone } from "@/entities/zone";

export type ZonePickerParams = {
  selected: Zone | null;
  /** The list's own toggle: selecting the selected zone lets go of it. */
  select: (id: number | null) => void;
  /** `placement:create`: without it a click selects and opens nothing. */
  canPlace: boolean;
  /** Places at the zone's centre; the id of the last object, null when it was refused. */
  place: (modelSlug: string, count: number) => Promise<number | null>;
};

/**
 * Which zone the add-objects picker is open for. A canvas click selects the zone (never toggles it off)
 * and, for a reader who can place, opens the picker on it; the picker counts only while that zone is
 * still the selected one.
 */
export function useZonePicker({ selected, select, canPlace, place }: ZonePickerParams) {
  const [pickingId, setPickingId] = useState<number | null>(null);
  const selectedId = selected?.id ?? null;
  // Letting go of the zone (or the zone going) closes its picker for good, so selecting it again from the panel does not reopen it.
  if (pickingId !== null && pickingId !== selectedId) setPickingId(null);

  const clicked = useCallback(
    (id: number | null) => {
      if (id !== selectedId) select(id);
      if (canPlace && id !== null) setPickingId(id);
    },
    [selectedId, select, canPlace],
  );
  const onClose = useCallback(() => setPickingId(null), []);
  const onPlace = useCallback(
    async (modelSlug: string, count: number) => {
      // A refused placing keeps the picker, and the toast says why.
      if ((await place(modelSlug, count)) !== null) setPickingId(null);
    },
    [place],
  );
  const onAddObjects = useCallback(() => setPickingId(selectedId), [selectedId]);
  const pick = useMemo(
    () => (canPlace && selected && pickingId === selected.id ? { zone: selected, onClose, onPlace } : null),
    [canPlace, selected, pickingId, onClose, onPlace],
  );
  return { clicked, pick, onAddObjects: canPlace && selected ? onAddObjects : undefined };
}
