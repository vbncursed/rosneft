import { useId } from "react";
import { Field, describedBy } from "@/shared/ui/field";
import { controlClass } from "@/shared/ui/text-field";
import type { ModelTag } from "../model/model-tag";

export type TagSelectProps = {
  /** `undefined` while the list loads or when it failed to; the control is then disabled. */
  tags: ModelTag[] | undefined;
  /** The chosen slug, or `null` while nothing is chosen — there is no default tag. */
  value: string | null;
  onChange: (slug: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
};

/** A required single choice: the placeholder stays selected until the reader picks. */
export function TagSelect({ tags, value, onChange, error, disabled, label = "Tag" }: TagSelectProps) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} required disabled={disabled}>
      <select
        id={id}
        required
        disabled={disabled || tags === undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, undefined, error)}
        className={controlClass({ invalid: Boolean(error) })}
      >
        <option value="" disabled>
          Choose a tag
        </option>
        {tags?.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.title}
          </option>
        ))}
      </select>
    </Field>
  );
}
