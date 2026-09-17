import { clsx as cx } from "clsx";
import { useId } from "react";
import { Icon } from "@/shared/ui/icon";

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Names the field for assistive tech. */
  label: string;
  placeholder?: string;
  className?: string;
};

/** Plain text search — no token syntax, unlike the audit filter bar. */
export function SearchField({ value, onChange, label, placeholder, className }: SearchFieldProps) {
  const id = useId();

  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-control border border-line-2 bg-panel px-3 py-2 focus-within:border-accent",
        className,
      )}
    >
      <Icon name="search" size={14} className="shrink-0 text-dim" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-fg outline-none placeholder:text-dim"
      />
    </div>
  );
}
