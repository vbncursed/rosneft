import { useId, useState } from "react";
import { cx } from "@/shared/lib/cx";
import { AXES, parseAxis, type Axis, type Vec3 } from "./vec3";

export type Vec3FieldProps = {
  label: string;
  value: Vec3;
  onChange: (value: Vec3) => void;
  disabled?: boolean;
  className?: string;
};

export function Vec3Field({ label, value, onChange, disabled = false, className }: Vec3FieldProps) {
  const groupId = useId();
  // Holds what is literally in a box while it is being typed, so "-" or "1."
  // survive until they parse. Cleared on blur, when `value` takes over again.
  const [draft, setDraft] = useState<Partial<Record<Axis, string>>>({});

  const commit = (axis: Axis, raw: string) => {
    setDraft((d) => ({ ...d, [axis]: raw }));
    const parsed = parseAxis(raw);
    if (parsed !== null) onChange({ ...value, [axis]: parsed });
  };

  return (
    <div className={cx("flex flex-col gap-3", className)} role="group" aria-labelledby={groupId}>
      <span
        id={groupId}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted"
      >
        {label}
      </span>
      <div className="grid grid-cols-3 gap-2">
        {AXES.map((axis) => (
          <label
            key={axis}
            className={cx(
              "flex items-center gap-1.5 rounded-control-sm border bg-panel-2 px-2 py-1.5 transition-colors duration-150",
              "focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent-soft",
              disabled ? "border-line opacity-60" : "border-line-2",
            )}
          >
            <span aria-hidden="true" className="font-mono text-[10px] text-accent">
              {axis}
            </span>
            <input
              value={draft[axis] ?? String(value[axis])}
              onChange={(e) => commit(axis, e.target.value)}
              onBlur={() => setDraft((d) => ({ ...d, [axis]: undefined }))}
              disabled={disabled}
              inputMode="decimal"
              aria-label={`${label} ${axis}`}
              className="w-full min-w-0 border-none bg-transparent font-mono text-[13px] text-fg outline-none disabled:text-dim"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
