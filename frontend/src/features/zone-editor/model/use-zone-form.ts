import { useState } from "react";
import { useZoneFields, type ZoneForm } from "./use-zone-fields";

export { MAX_ZONE_TAGS, type ZoneForm } from "./use-zone-fields";

/** The new-zone form: the shared fields plus the create call and the rectangle it waits for. */
export function useZoneForm({
  canPlace,
  blocked,
  onCreate,
}: {
  canPlace: boolean;
  /** Why the picked rectangle cannot become a zone; null when it can. */
  blocked: string | null;
  onCreate: (form: ZoneForm) => Promise<void>;
}) {
  const f = useZoneFields({ title: "", tagSlugs: [] });
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onCreate({ title: f.trimmed, tagSlugs: f.selected });
      f.reset();
    } catch (err) {
      f.reject(err, "Could not create the zone. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return {
    ...f,
    busy,
    blocked,
    canCreate:
      canPlace && blocked === null && !busy && f.tags !== undefined && f.trimmed.length > 0 && f.selected.length > 0,
    submit,
  };
}
