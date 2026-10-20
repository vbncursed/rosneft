import { useMutation } from "@tanstack/react-query";
import { exportTerritory, type ExportVariant } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { saveBlob } from "@/shared/lib/download";
import { notify } from "@/shared/lib/notify";

const FILE_SUFFIX: Record<ExportVariant, string> = {
  compressed: ".glb",
  compatible: "-compatible.glb",
  obj: "-obj.zip",
};

/** Fetches the territory as one file and hands it to the browser as `<slug>.glb`, `<slug>-compatible.glb` or `<slug>-obj.zip`. */
// ponytail: the whole GLB or ZIP sits in memory as a Blob (as with the audit CSV), and the compatible GLB is about 3x larger; stream to disk (File System Access) once exports pass a few hundred MB.
export function useTerritoryExport(slug: string): { busy: boolean; run: (variant: ExportVariant) => void } {
  const { isPending, mutate } = useMutation({
    mutationFn: (variant: ExportVariant) => exportTerritory(slug, variant),
    onSuccess: (blob, variant) => saveBlob(blob, `${slug}${FILE_SUFFIX[variant]}`),
    onError: (err) => notify.error(messageOf(err, "Export failed")),
  });
  return { busy: isPending, run: mutate };
}
