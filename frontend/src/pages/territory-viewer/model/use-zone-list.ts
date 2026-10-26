import { useCallback, useState } from "react";
import { deleteZone, type Zone } from "@/entities/zone";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { useStoredSwitch } from "@/shared/lib/use-stored-switch";

export type ZoneListParams = {
  slug: string;
  /** The bundle's zones, seeded once; a write marks the scene stale, to be re-read on the next visit. */
  initial: Zone[];
  onChanged: () => void;
};

/** The territory's zones as the viewer holds them: the list, the one selected, and the "Show zones" switch. */
export function useZoneList({ slug, initial, onChanged }: ZoneListParams) {
  const [zones, setZones] = useState<Zone[]>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [show, toggleShow] = useStoredSwitch("andrey.zones");

  const select = useCallback((id: number | null) => setSelectedId((now) => (now === id ? null : id)), []);
  const add = useCallback(
    (zone: Zone) =>
      setZones((prev) =>
        prev.some((z) => z.id === zone.id) ? prev.map((z) => (z.id === zone.id ? zone : z)) : [...prev, zone],
      ),
    [],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await deleteZone(slug, id);
        setZones((prev) => prev.filter((z) => z.id !== id));
        setSelectedId((now) => (now === id ? null : now));
        notify.success("Zone deleted");
      } catch (err) {
        notify.error(messageOf(err));
      } finally {
        // Both ways: a refused delete may mean the row is already gone for another reason.
        onChanged();
      }
    },
    // oxlint-disable-next-line react/memo-dependencies -- false positive: oxlint does not see the onChanged call inside finally
    [slug, onChanged],
  );

  return {
    zones,
    selected: zones.find((z) => z.id === selectedId) ?? null,
    select,
    add,
    remove,
    show,
    toggleShow,
  };
}
