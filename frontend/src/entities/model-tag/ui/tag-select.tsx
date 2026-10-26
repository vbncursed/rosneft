import { useId } from "react";
import { Field, describedBy } from "@/shared/ui/field";
import { Dropdown } from "@/shared/ui/dropdown";
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

/** The placeholder is a disabled leading option: shown while nothing is chosen, never pickable. */
const PLACEHOLDER = { value: "", label: "Choose a tag", disabled: true };

/** A required single choice: the placeholder stays selected until the reader picks. */
export function TagSelect({ tags, value, onChange, error, disabled, label = "Tag" }: TagSelectProps) {
  const id = useId();
  const options = [PLACEHOLDER, ...(tags ?? []).map((t) => ({ value: t.slug, label: t.title }))];
  return (
    <Field id={id} label={label} error={error} required disabled={disabled}>
      <Dropdown
        id={id}
        className="mt-[7px]"
        options={options}
        value={value ?? ""}
        onChange={onChange}
        disabled={disabled || tags === undefined}
        invalid={Boolean(error)}
        describedBy={describedBy(id, undefined, error)}
      />
    </Field>
  );
}
