import { useMutation } from "@tanstack/react-query";
import { exportTerritoryGlb, type ExportVariant } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { saveBlob } from "@/shared/lib/download";
import { notify } from "@/shared/lib/notify";

/** Fetches the territory as one GLB and hands it to the browser as `<slug>.glb` (`<slug>-compatible.glb` for the compatible variant). */
// ponytail: the whole GLB sits in memory as a Blob (as with the audit CSV), and the compatible one is about 3x larger; stream to disk (File System Access) once exports pass a few hundred MB.
export function useTerritoryExport(slug: string): { busy: boolean; run: (variant: ExportVariant) => void } {
  const { isPending, mutate } = useMutation({
    mutationFn: (variant: ExportVariant) => exportTerritoryGlb(slug, variant),
    onSuccess: (blob, variant) => saveBlob(blob, variant === "compatible" ? `${slug}-compatible.glb` : `${slug}.glb`),
    onError: (err) => notify.error(messageOf(err, "Export failed")),
  });
  return { busy: isPending, run: mutate };
}
