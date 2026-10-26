import { useState } from "react";
import { TagChip } from "@/entities/model-tag";
import type { ModelOption } from "@/entities/scene";
import { modelsForZone, type Zone } from "@/entities/zone";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { QuantityStepper } from "@/shared/ui/quantity-stepper";

export type ZonePanelProps = {
  zone: Zone;
  /** The drawing's size against the model's; null without a drawing size. */
  sizeLine: { text: string; warn: boolean } | null;
  inside: number;
  /** Every placeable model; the panel keeps the ones that carry the zone's tags. */
  options: Pick<ModelOption, "slug" | "title" | "tag">[];
  /** `placement:create`: without it the list is read-only. */
  canPlace: boolean;
  onPlace: (modelSlug: string, count: number) => void;
  /** Opens the whole model library, not just this zone's tags. */
  onWholeLibrary: () => void;
  /** Lets go of the zone: the card closes. */
  onClose: () => void;
  /** `zone:write` only. */
  onEdit?: () => void;
  onDelete?: () => void;
};

const MAX_COUNT = 99;
const EMPTY = "No catalog models carry this zone's tags.";

function Row({ title, canPlace, onPlace }: { title: string; canPlace: boolean; onPlace: (count: number) => void }) {
  const [count, setCount] = useState(1);
  return (
    <li className="flex items-center gap-2 rounded-[9px] border border-line bg-panel px-2.5 py-2">
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">{title}</span>
      {canPlace ? (
        <>
          <QuantityStepper value={count} onChange={setCount} max={MAX_COUNT} label={`Count of ${title}`} />
          <Button size="sm" variant="secondary" aria-label={`Place ${title}`} onClick={() => onPlace(count)}>
            Place
          </Button>
        </>
      ) : null}
    </li>
  );
}

/** One zone in the Overlays panel: what it is, how big, how full, and the equipment it can take. */
export function ZonePanel({
  zone,
  sizeLine,
  inside,
  options,
  canPlace,
  onPlace,
  onWholeLibrary,
  onClose,
  onEdit,
  onDelete,
}: ZonePanelProps) {
  const [asking, setAsking] = useState(false);
  const models = modelsForZone(options, zone);
  return (
    <section
      aria-label={`Zone ${zone.title}`}
      className="mb-3.5 flex flex-col gap-2.5 rounded-card border border-accent-line bg-panel-2 p-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{zone.title}</h3>
        {onEdit ? (
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit zones
          </Button>
        ) : null}
        {onDelete ? (
          <Button size="sm" variant="secondary" aria-label={`Delete ${zone.title}`} onClick={() => setAsking(true)}>
            Delete
          </Button>
        ) : null}
        <Button shape="icon" size="xs" variant="ghost" aria-label={`Close ${zone.title}`} onClick={onClose}>
          <Icon name="close" size={11} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {zone.tags.map((tag) => (
          <TagChip key={tag.slug} tag={tag} />
        ))}
      </div>
      {sizeLine ? (
        <Callout tone={sizeLine.warn ? "warn" : "neutral"} size="note">
          {sizeLine.text}
        </Callout>
      ) : null}
      <p className="m-0 font-mono text-[11px] text-muted">
        {inside} {inside === 1 ? "placement" : "placements"} inside
      </p>
      {models.length > 0 ? (
        <ul aria-label="Equipment" className="m-0 flex list-none flex-col gap-1.5 p-0">
          {models.map((m) => (
            <Row key={m.slug} title={m.title} canPlace={canPlace} onPlace={(count) => onPlace(m.slug, count)} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="m-0 text-[12px] text-muted">{EMPTY}</p>
          {canPlace ? (
            <Button size="sm" variant="secondary" onClick={onWholeLibrary}>
              Whole library…
            </Button>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={asking}
        title={`Delete ${zone.title}?`}
        description="The zone is removed from this territory. Placements inside it stay."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          setAsking(false);
          onDelete?.();
        }}
        onCancel={() => setAsking(false)}
      />
    </section>
  );
}
