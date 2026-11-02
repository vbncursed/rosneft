import { useEffect, useRef } from "react";
import type { Zone } from "@/entities/zone";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import { MAX_ZONE_TAGS } from "../model/use-zone-fields";
import { useZoneEdit } from "../model/use-zone-edit";
import type { ZonePatch } from "../model/zone-patch";
import { TagMultiSelect } from "./tag-multi-select";

export type ZoneEditFormProps = {
  zone: Zone;
  onSave: (patch: ZonePatch) => Promise<void>;
  /** Saved or cancelled: the card goes back to reading. */
  onDone: () => void;
};

const MAX_TITLE = 120;

/** Renames a saved zone and changes its tags; Escape cancels and is not passed on to the viewer. */
export function ZoneEditForm({ zone, onSave, onDone }: ZoneEditFormProps) {
  const f = useZoneEdit({ zone, onSave, onDone });
  const form = useRef<HTMLFormElement>(null);
  // The reader pressed Edit details to type: the cursor starts in Title.
  useEffect(() => form.current?.querySelector("input")?.focus(), []);
  return (
    <form
      ref={form}
      aria-label={`Edit details of ${zone.title}`}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.canSave) void f.submit();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Escape ends the edit only: the viewer's own ladder would let go of the zone as well.
        e.stopPropagation();
        onDone();
      }}
    >
      <TextField
        label="Title"
        required
        maxLength={MAX_TITLE}
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
        error={f.error}
      />
      <TagMultiSelect
        tags={f.tags}
        selected={f.selected}
        atLimit={f.atLimit}
        max={MAX_ZONE_TAGS}
        error={f.tagsError}
        onToggle={f.toggleTag}
        onRetry={f.retryTags}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={!f.canSave} loading={f.busy}>
          Save
        </Button>
        <Button size="sm" variant="secondary" disabled={f.busy} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
