import { useCallback, useState } from "react";
import { updateTerritory } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

/**
 * The territory's external panorama-tour URL, editable from the viewer. The
 * last acknowledged value is kept here so the link updates the moment a save
 * lands, without refetching the whole scene bundle. `onChanged` is the
 * viewer's: it marks the bundle, the territory and the list stale and drops
 * the bundle on the way out, so a return visit seeds the saved link.
 */
export function useTerritoryLink(slug: string, initialUrl: string | undefined, onChanged: () => void) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);

  // Answers whether the PATCH landed, so the caller decides whether to close
  // its editor; a refusal surfaces as a toast rather than a throw.
  const save = useCallback(
    async (next: string): Promise<boolean> => {
      setSaving(true);
      try {
        const territory = await updateTerritory(slug, { externalPanoramaUrl: next });
        setUrl(territory.externalPanoramaUrl ?? "");
        onChanged();
        return true;
      } catch (err) {
        notify.error(`Failed to save the panorama tour link: ${messageOf(err)}`);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [slug, onChanged],
  );

  return { url, saving, save };
}
