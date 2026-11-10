import { useEffect, useRef, useState } from "react";
import { useZoneFields, type ZoneForm } from "./use-zone-fields";

export { MAX_ZONE_TAGS, type ZoneForm } from "./use-zone-fields";

/** The new-zone form: the shared fields plus the create call and the rectangle it waits for. */
export function useZoneForm({
  canPlace,
  blocked,
  onCreate,
  suggestion,
}: {
  canPlace: boolean;
  /** Why the picked rectangle cannot become a zone; null when it can. */
  blocked: string | null;
  onCreate: (form: ZoneForm, unchanged: () => boolean) => Promise<void | boolean>;
  suggestion?: ZoneForm | null;
}) {
  const f = useZoneFields(suggestion ?? { title: "", tagSlugs: [] }, true);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );

  async function submit() {
    setBusy(true);
    const submittedRevision = revision.current;
    try {
      const sameDraft = await onCreate(
        { title: f.trimmed, tagSlugs: f.selected },
        () => revision.current === submittedRevision,
      );
      if (sameDraft !== false && revision.current === submittedRevision) f.reset();
    } catch (err) {
      f.reject(err, "Could not create the zone. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return {
    ...f,
    setTitle: (title: string) => {
      revision.current++;
      f.setTitle(title);
    },
    toggleTag: (slug: string) => {
      revision.current++;
      f.toggleTag(slug);
    },
    busy,
    blocked,
    canCreate:
      canPlace && blocked === null && !busy && f.tags !== undefined && f.trimmed.length > 0 && f.selected.length > 0,
    submit,
  };
}
