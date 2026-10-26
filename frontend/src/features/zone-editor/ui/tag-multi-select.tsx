import type { ModelTag } from "@/entities/model-tag";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";

export type TagMultiSelectProps = {
  /** `undefined` while the list loads or when it failed to. */
  tags: ModelTag[] | undefined;
  selected: string[];
  atLimit: boolean;
  max: number;
  error: string | null;
  onToggle: (slug: string) => void;
  onRetry: () => void;
};

/** Up to `max` tags out of the fixed list; a list that failed to load says so and offers no choice. */
export function TagMultiSelect({ tags, selected, atLimit, max, error, onToggle, onRetry }: TagMultiSelectProps) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="p-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        Tags <span aria-hidden="true">*</span>
      </legend>
      {error ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-bad">
          {error}
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Reload tags
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-2 mt-1 text-[11px] text-dim">
            Pick 1 to {max}: models with these tags can be placed here. {selected.length} of {max} chosen.
          </p>
          <div className="flex flex-col gap-2">
            {tags?.map((t) => (
              <Checkbox
                key={t.slug}
                label={t.title}
                checked={selected.includes(t.slug)}
                disabled={atLimit && !selected.includes(t.slug)}
                onChange={() => onToggle(t.slug)}
              />
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}
