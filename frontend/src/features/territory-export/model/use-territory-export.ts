import { useMutation } from "@tanstack/react-query";
import { exportTerritoryGlb } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { saveBlob } from "@/shared/lib/download";
import { notify } from "@/shared/lib/notify";

/** Fetches the territory as one GLB and hands it to the browser as `<slug>.glb`. */
// ponytail: the whole GLB sits in memory as a Blob (as with the audit CSV); stream to disk (File System Access) once exports pass a few hundred MB.
export function useTerritoryExport(slug: string): { busy: boolean; run: () => void } {
  const { isPending, mutate } = useMutation({
    mutationFn: () => exportTerritoryGlb(slug),
    onSuccess: (blob) => saveBlob(blob, `${slug}.glb`),
    onError: (err) => notify.error(messageOf(err, "Export failed")),
  });
  return { busy: isPending, run: () => mutate() };
}
