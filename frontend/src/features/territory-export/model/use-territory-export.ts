import { useRef, useState } from "react";
import { checkExport, exportDownloadUrl, type ExportVariant } from "@/entities/territory";
import { messageOf } from "@/shared/api";
import { desktopBridge } from "@/shared/lib/desktop";
import { formatBytes } from "@/shared/lib/format-bytes";
import { notify } from "@/shared/lib/notify";

/**
 * Asks the gateway whether the export can be built (its refusals arrive as toasts), then hands the download itself
 * to the browser through a same-origin link. The file never passes through JS; busy ends at the click.
 */
// ponytail: no progress and no cancel here — the browser's download manager owns the transfer (files reach 800 MB); a reload no longer aborts it.
export function useTerritoryExport(slug: string): { busy: boolean; run: (variant: ExportVariant) => void } {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = async (variant: ExportVariant) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const { filename, sizeBytes } = await checkExport(slug, variant);
      const a = document.createElement("a");
      a.href = exportDownloadUrl(slug, variant);
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      const size = sizeBytes === undefined ? "" : ` (${formatBytes(sizeBytes)})`;
      // The desktop shell has no download manager: its save dialog is what the reader meets next.
      const where = desktopBridge() ? "choose where to save it" : "see your browser's downloads";
      notify.info(`Download started: ${filename}${size} — ${where}`);
    } catch (err) {
      notify.error(messageOf(err, "Export failed"));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, run: (v) => void run(v) };
}
