import { useId, useState, type ChangeEvent } from "react";
import { clsx as cx } from "clsx";
import { AXES, parseAxis, type Axis, type Vec3 } from "./vec3";

export type Vec3FieldProps = {
  label: string;
  value: Vec3;
  onChange: (value: Vec3) => void;
  disabled?: boolean;
  /**
   * `stack` is the form field: a labelled block of three prefixed boxes.
   * `row` is one line of the viewer panel's transform grid — the label as the
   * first grid cell, then three bare cells. Three rows sharing the same
   * first-column minimum read as one grid.
   */
  layout?: "stack" | "row";
  /** `row` only: the cells print their number instead of accepting one. */
  readOnly?: boolean;
  /** `row` only: how a read-only cell prints its number (`12.400`, `90°`). */
  format?: (value: number) => string;
  className?: string;
};

// The row cell's whole box, shared by the input and the read-only span so the
// two frames are the same size. Neither the text colour nor the border colour
// is set here: each state sets its own, once.
const ROW_CELL = "rounded-[6px] border border-line-2 bg-panel-2 px-[7px] py-1.5 text-right font-mono text-[11px]";

export function Vec3Field({
  label,
  value,
  onChange,
  disabled = false,
  layout = "stack",
  readOnly = false,
  format = String,
  className,
}: Vec3FieldProps) {
  const groupId = useId();
  // Holds what is literally in a box while it is being typed, so "-" or "1."
  // survive until they parse. Cleared on blur, when `value` takes over again.
  const [draft, setDraft] = useState<Partial<Record<Axis, string>>>({});

  const commit = (axis: Axis, raw: string) => {
    setDraft((d) => ({ ...d, [axis]: raw }));
    const parsed = parseAxis(raw);
    if (parsed !== null) onChange({ ...value, [axis]: parsed });
  };

  const box = (axis: Axis) => ({
    value: draft[axis] ?? String(value[axis]),
    onChange: (e: ChangeEvent<HTMLInputElement>) => commit(axis, e.target.value),
    onBlur: () => setDraft((d) => ({ ...d, [axis]: undefined })),
    disabled,
    inputMode: "decimal" as const,
    "aria-label": `${label} ${axis}`,
  });

  if (layout === "row") {
    return (
      <div
        role="group"
        aria-labelledby={groupId}
        className={cx("grid grid-cols-[auto_repeat(3,1fr)] items-center gap-2", className)}
      >
        <span
          id={groupId}
          className="min-w-[26px] font-mono text-[9px] uppercase tracking-[0.12em] text-muted"
        >
          {label}
        </span>
        {AXES.map((axis) =>
          readOnly ? (
            <span key={axis} className={cx(ROW_CELL, "min-w-0 truncate text-muted")}>
              {format(value[axis])}
            </span>
          ) : (
            <input
              key={axis}
              {...box(axis)}
              className={cx(ROW_CELL, "min-w-0 text-fg outline-none focus:border-accent disabled:text-dim")}
            />
          ),
        )}
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col gap-3", className)} role="group" aria-labelledby={groupId}>
      <span id={groupId} className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
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
              {...box(axis)}
              className="w-full min-w-0 border-none bg-transparent font-mono text-[13px] text-fg outline-none disabled:text-dim"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
