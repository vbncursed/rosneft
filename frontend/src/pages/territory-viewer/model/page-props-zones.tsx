import { Suspense, type ReactNode } from "react";
import { ZonePanel } from "@/features/zone-equipment";
import { PlanLayersLazy } from "../ui/plan-layers-lazy";
import type { PageParts } from "./viewer-props";

/** The plan layer, loaded on demand; nothing mounts, and nothing loads, while there is no plan to read. */
export function planLayer(p: PageParts): ReactNode {
  const { layer } = p.zones;
  return layer ? (
    <Suspense fallback={null}>
      <PlanLayersLazy {...layer} />
    </Suspense>
  ) : null;
}

/** What sits above the Overlays tabs: the align card's slot while the editor is open, and the selected zone's card. */
export function zoneCard(p: PageParts): ReactNode {
  const { zones, grants, options, on } = p;
  const { selected } = zones;
  if (!zones.editing && !selected) return null;
  const aligned = p.documents.list.find((d) => d.calibration !== null);
  return (
    <>
      {zones.editing ? <div ref={zones.setSlot} data-testid="plan-editor-slot" /> : null}
      {selected ? (
        <ZonePanel
          zone={selected}
          sizeLine={zones.equipment.sizeLine}
          inside={zones.equipment.inside}
          options={options}
          canPlace={grants.create}
          onPlace={zones.equipment.onPlace}
          onWholeLibrary={on.onAdd}
          onClose={() => zones.onSelect(null)}
          onEdit={zones.onAlign && aligned ? () => zones.onAlign?.(aligned.id) : undefined}
          onDelete={grants.zoneWrite ? () => void zones.onDelete(selected.id) : undefined}
        />
      ) : null}
    </>
  );
}
