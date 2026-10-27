import { useRef, useState } from "react";
import type { Zone } from "@/entities/zone";
import { HttpError } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { useZoneFields } from "./use-zone-fields";
import { zonePatch, type ZonePatch } from "./zone-patch";

/** The edit form of a saved zone: prefilled, saving only what changed, a refusal under the field. */
export function useZoneEdit({
  zone,
  onSave,
  onDone,
}: {
  zone: Zone;
  /** Rejects with the server's refusal; a zone gone for good resolves, and the card goes with it. */
  onSave: (patch: ZonePatch) => Promise<void>;
  onDone: () => void;
}) {
  const f = useZoneFields({ title: zone.title, tagSlugs: zone.tags.map((t) => t.slug) });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const patch = zonePatch(zone, f.title, f.selected);

  async function submit() {
    if (!patch || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await onSave(patch);
      onDone();
    } catch (err) {
      // A refusal (a title already taken) belongs under the field; an outage does not.
      if (err instanceof HttpError && err.status < 500) f.setError(err.message);
      else notify.error("Could not update the zone. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    ...f,
    busy,
    canSave: patch !== null && !busy && f.tags !== undefined && f.trimmed.length > 0 && f.selected.length > 0,
    submit,
  };
}
