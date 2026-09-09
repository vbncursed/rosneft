import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Field, describedBy } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { controlClass } from "@/shared/ui/text-field";

export type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  /** A control beside the label — "Generate" on an admin form, "Forgot?" on login. */
  action?: { label: string; onClick: (reveal: () => void) => void };
  fieldClassName?: string;
};

export function PasswordField({
  label,
  hint,
  error,
  id,
  action,
  className,
  fieldClassName,
  required,
  disabled,
  ...rest
}: PasswordFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [shown, setShown] = useState(false);

  return (
    <Field
      id={fieldId}
      label={label}
      labelAction={
        action ? (
          <button
            type="button"
            onClick={() => action.onClick(() => setShown(true))}
            disabled={disabled}
            className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-55"
          >
            {action.label}
          </button>
        ) : undefined
      }
      hint={hint}
      error={error}
      required={required}
      disabled={disabled}
      className={fieldClassName}
    >
      <div className="relative mt-[7px]">
        <input
          id={fieldId}
          type={shown ? "text" : "password"}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={controlClass({
            mono: shown,
            invalid: Boolean(error),
            spaced: false,
            className: `pr-10 ${className ?? ""}`,
          })}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          disabled={disabled}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className={`absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer border-none bg-transparent p-0 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${
            shown ? "text-accent" : "text-muted hover:text-fg"
          }`}
        >
          <Icon name={shown ? "eye-off" : "eye"} size={17} />
        </button>
      </div>
    </Field>
  );
}
