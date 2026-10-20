import { useOnline } from "@/shared/lib/use-online";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useTerritoryExport } from "../model/use-territory-export";

/** The export can take seconds, so the button spins: a press with no visible effect reads as a dead click. */
export function ExportButton({ slug }: { slug: string }) {
  const { busy, run } = useTerritoryExport(slug);
  const online = useOnline();
  return (
    <Button variant="secondary" disabled={!online} loading={busy} onClick={run}>
      <Icon name="download" size={14} className="mr-2" />
      Download
    </Button>
  );
}
