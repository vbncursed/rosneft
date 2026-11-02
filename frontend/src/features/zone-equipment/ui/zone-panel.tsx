import { useCallback, useState, type ReactNode } from "react";
import { TagChip } from "@/entities/model-tag";
import type { Zone } from "@/entities/zone";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";

export type ZonePanelProps = {
  zone: Zone;
  /** The drawing's size against the model's; null without a drawing size. */
  sizeLine: { text: string; warn: boolean } | null;
  inside: number;
  /** `placement:create`: opens the model list filtered to this zone's tags. Absent, the card offers no placing. */
  onAddObjects?: () => void;
  /** Lets go of the zone: the card closes. */
  onClose: () => void;
  /** `zone:write` only. */
  onEdit?: () => void;
  onDelete?: () => void;
  /** `zone:write`: the form that renames the zone and changes its tags, shown in place of the title and tags; `done` leaves it. */
  renderEdit?: (done: () => void) => ReactNode;
  /** The pointer or focus reached Edit details: the page may warm what the form needs. */
  onEditIntent?: () => void;
};

/** One zone in the Overlays panel: what it is, how big, how full, and the way into the models it can take. */
export function ZonePanel({
  zone,
  sizeLine,
  inside,
  onAddObjects,
  onClose,
  onEdit,
  onDelete,
  renderEdit,
  onEditIntent,
}: ZonePanelProps) {
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [refocus, setRefocus] = useState(false);
  // The read view's Edit details is a fresh node once the form is gone; it takes the focus as it mounts.
  const takeFocus = useCallback((node: HTMLButtonElement | null) => (refocus ? node?.focus() : undefined), [refocus]);
  const finishEdit = useCallback(() => {
    setRefocus(true);
    setEditing(false);
  }, []);
  return (
    <section
      aria-label={`Zone ${zone.title}`}
      data-tour="zone-card"
      className="mb-3.5 flex flex-col gap-2.5 rounded-card border border-accent-line bg-panel-2 p-3"
    >
      {editing && renderEdit ? (
        renderEdit(finishEdit)
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h3 className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{zone.title}</h3>
            <Button shape="icon" size="xs" variant="ghost" aria-label={`Close ${zone.title}`} onClick={onClose}>
              <Icon name="close" size={11} />
            </Button>
          </div>
          {renderEdit || onEdit || onDelete ? (
            <div className="flex flex-wrap gap-2">
              {renderEdit ? (
                <Button
                  ref={takeFocus}
                  size="sm"
                  variant="secondary"
                  aria-label={`Edit details of ${zone.title}`}
                  onPointerEnter={onEditIntent}
                  onPointerDown={onEditIntent}
                  onFocus={onEditIntent}
                  onClick={() => {
                    setRefocus(false);
                    setEditing(true);
                  }}
                >
                  Edit details
                </Button>
              ) : null}
              {onEdit ? (
                <Button size="sm" variant="secondary" onClick={onEdit}>
                  Edit zones
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Delete ${zone.title}`}
                  onClick={() => setAsking(true)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {zone.tags.map((tag) => (
              <TagChip key={tag.slug} tag={tag} />
            ))}
          </div>
        </>
      )}
      {sizeLine ? (
        <Callout tone={sizeLine.warn ? "warn" : "neutral"} size="note">
          {sizeLine.text}
        </Callout>
      ) : null}
      <p className="m-0 font-mono text-[11px] text-muted">
        {inside} {inside === 1 ? "placement" : "placements"} inside
      </p>
      {onAddObjects ? (
        <Button size="sm" variant="secondary" onClick={onAddObjects} data-tour="zone-place">
          Add objects
        </Button>
      ) : null}
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
