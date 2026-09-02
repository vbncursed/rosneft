import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { clsx as cx } from "clsx";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  label?: ReactNode;
  id?: string;
  labelClassName?: string;
};

export function Checkbox({ label, id, className, labelClassName, ...rest }: CheckboxProps) {
  const autoId = useId();
  const boxId = id ?? autoId;

  return (
    <label
      htmlFor={boxId}
      className={cx(
        "inline-flex items-center gap-[9px] text-[13px] text-fg",
        rest.disabled ? "opacity-45" : "cursor-pointer",
        labelClassName,
      )}
    >
      {/* The real control stays in the tree — screen readers and forms need it;
          the square beside it is what the design draws. */}
      <input id={boxId} type="checkbox" className={cx("peer sr-only", className)} {...rest} />
      <span
        aria-hidden="true"
        className="flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border border-line-2 bg-panel-2 text-transparent transition-colors duration-150 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:peer-checked:border-line-2 peer-disabled:peer-checked:bg-line-2"
      >
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.3 4.8 8.6 9.5 3.6" />
        </svg>
      </span>
      {label}
    </label>
  );
}
