import { useCallback, useState } from "react";
import { updateTerritory } from "@/territory/infrastructure/territory-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";

// useTerritoryLink owns the editable external-panorama URL for one territory.
// It keeps the last server-acknowledged value locally so the viewer updates
// the moment a save succeeds, without re-fetching the whole scene bundle.
export function useTerritoryLink(slug: string, initialUrl: string | undefined) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);

  // save returns whether the PATCH succeeded so the caller can decide
  // whether to close its editor; errors surface as a toast, not a throw.
  const save = useCallback(
    async (next: string): Promise<boolean> => {
      setSaving(true);
      try {
        const territory = await updateTerritory(slug, {
          externalPanoramaUrl: next,
        });
        setUrl(territory.externalPanoramaUrl ?? "");
        return true;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Failed to save link");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [slug],
  );

  return { url, saving, save };
}
