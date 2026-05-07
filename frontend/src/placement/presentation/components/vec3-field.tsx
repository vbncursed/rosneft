import { memo, useCallback } from "react";
import type { Vec3 } from "@/shared/domain/vec3";

interface Vec3FieldProps {
  label: string;
  value: Vec3;
  onChange: (next: Vec3) => void;
  step: number;
  min?: number;
}

const AXES = ["x", "y", "z"] as const;

function parseAxis(raw: string): number {
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
}

function Vec3FieldImpl({ label, value, onChange, step, min }: Vec3FieldProps) {
  // One useCallback per axis instead of a `set(axis)` factory called
  // three times per render. The deps line up with the usual update
  // path: `value` and `onChange` change → handlers update; the rest of
  // the form re-rendering for unrelated reasons (label keystroke,
  // sibling Vec3Field edit) leaves these stable.
  const handleX = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, x: parseAxis(event.target.value) }),
    [onChange, value],
  );
  const handleY = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, y: parseAxis(event.target.value) }),
    [onChange, value],
  );
  const handleZ = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, z: parseAxis(event.target.value) }),
    [onChange, value],
  );

  const handlers = { x: handleX, y: handleY, z: handleZ } as const;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </span>
      <div className="grid grid-cols-3 gap-2">
        {AXES.map((axis) => (
          <label
            key={axis}
            className="flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 focus-within:border-white/40"
          >
            <span className="text-[10px] uppercase text-neutral-500">{axis}</span>
            <input
              type="number"
              value={value[axis]}
              onChange={handlers[axis]}
              step={step}
              min={min}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default memo(Vec3FieldImpl);
