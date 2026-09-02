import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Field, describedBy } from "@/shared/ui/field";
import { controlClass } from "./control-class";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Slugs, hashes and ids read as mono in this design. */
  mono?: boolean;
  id?: string;
  fieldClassName?: string;
};

export function TextField({
  label,
  hint,
  error,
  mono = false,
  id,
  className,
  fieldClassName,
  required,
  disabled,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      disabled={disabled}
      className={fieldClassName}
    >
      <input
        id={fieldId}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={controlClass({ mono, invalid: Boolean(error), className })}
        {...rest}
      />
    </Field>
  );
}
