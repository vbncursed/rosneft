import { useId, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Field, describedBy } from "@/shared/ui/field";
import { controlClass } from "./control-class";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  fieldClassName?: string;
};

export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  fieldClassName,
  required,
  disabled,
  rows = 3,
  ...rest
}: TextareaProps) {
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
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={controlClass({ invalid: Boolean(error), className: `resize-y ${className ?? ""}` })}
        {...rest}
      />
    </Field>
  );
}
