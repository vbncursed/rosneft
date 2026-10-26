import { MAX_ZONE_TAGS, useZoneForm, type ZoneForm as ZoneFormValues } from "../model/use-zone-form";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import { TagMultiSelect } from "./tag-multi-select";

export type ZoneFormProps = {
  /** The picked rectangle's name, or null while none is picked. */
  rectName: string | null;
  /** A rectangle is picked and the plan is aligned, so the zone can be placed. */
  canPlace: boolean;
  /** Why the picked rectangle cannot become a zone (it has no area); null when it can. */
  blocked?: string | null;
  onCreate: (form: ZoneFormValues) => Promise<void>;
};

const MAX_TITLE = 120;

/** Names the picked rectangle and gives it one to five tags. */
export function ZoneForm({ rectName, canPlace, blocked = null, onCreate }: ZoneFormProps) {
  const f = useZoneForm({ canPlace, blocked, onCreate });
  return (
    <form
      aria-label="New zone"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.canCreate) void f.submit();
      }}
    >
      <p className="m-0 text-[12px] text-muted">
        {rectName ? `Selected: ${rectName}` : "Pick a rectangle on the plan to make it a zone."}
      </p>
      {f.blocked ? <p className="m-0 text-[12px] text-bad">{f.blocked}</p> : null}
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
      <Button type="submit" variant="primary" disabled={!f.canCreate} loading={f.busy}>
        Create zone
      </Button>
    </form>
  );
}
