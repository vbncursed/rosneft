import { useOnline } from "@/shared/lib/use-online";
import { ButtonContent, buttonClass } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Menu } from "@/shared/ui/menu";
import { useTerritoryExport } from "../model/use-territory-export";

/** The export can take seconds, so the trigger spins: a press with no visible effect reads as a dead click. */
export function ExportButton({ slug }: { slug: string }) {
  const { busy, run } = useTerritoryExport(slug);
  const online = useOnline();
  return (
    <Menu
      align="end"
      triggerLabel="Download"
      triggerTooltip={false}
      triggerClassName={buttonClass({ variant: "secondary" })}
      disabled={!online || busy}
      trigger={
        <ButtonContent loading={busy}>
          <Icon name="download" size={14} />
          Download
          <Icon name="chevron-down" size={12} />
        </ButtonContent>
      }
      items={[
        { label: "Compressed GLB — web viewers", onSelect: () => run("compressed") },
        { label: "Compatible GLB — Blender, desktop apps", onSelect: () => run("compatible") },
      ]}
    />
  );
}
