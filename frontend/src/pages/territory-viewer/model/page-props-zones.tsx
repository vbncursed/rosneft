import { Suspense, type ReactNode } from "react";
import { modelsForZone } from "@/entities/zone";
import { ZonePanel } from "@/features/zone-equipment";
import type { PlaceObjectsModalProps } from "@/widgets/model-picker";
import { PlanLayersLazy } from "../ui/plan-layers-lazy";
import { ZoneEditFormLazy } from "../ui/zone-edit-lazy";
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
  const { zones } = p;
  const { selected } = zones;
  if (!zones.editing && !selected) return null;
  const aligned = p.documents.list.find((d) => d.calibration !== null);
  return (
    <>
      {zones.editing ? <div ref={zones.setSlot} data-testid="plan-editor-slot" /> : null}
      {selected ? (
        <ZonePanel
          key={selected.id}
          zone={selected}
          sizeLine={zones.equipment.sizeLine}
          inside={zones.equipment.inside}
          onAddObjects={zones.onAddObjects}
          onClose={() => zones.onSelect(null)}
          onEdit={zones.onAlign && aligned ? () => zones.onAlign?.(aligned.id) : undefined}
          onDelete={p.grants.zoneWrite ? () => void zones.onDelete(selected.id) : undefined}
          renderEdit={
            p.grants.zoneWrite
              ? (done) => (
                  <Suspense fallback={null}>
                    <ZoneEditFormLazy
                      zone={selected}
                      onSave={(patch) => zones.onUpdate(selected.id, patch)}
                      onDone={done}
                    />
                  </Suspense>
                )
              : undefined
          }
        />
      ) : null}
    </>
  );
}

/**
 * The add-objects picker while a zone is open for it: the same dialog the rail's
 * Add opens, its list the models that carry the zone's tags. Null otherwise, and
 * the page's own picker props apply.
 */
export function zonePicker(p: PageParts): PlaceObjectsModalProps | null {
  const { pick } = p.zones;
  if (!pick) return null;
  return {
    open: true,
    onClose: pick.onClose,
    territoryTitle: p.title,
    options: p.options,
    placing: p.placing,
    onPlace: (slug, count) => void pick.onPlace(slug, count),
    zone: { title: pick.zone.title, models: modelsForZone(p.options, pick.zone) },
  };
}
