"use client";

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
  error?: string | null;
}

const inputBase =
  "mt-2 block w-full rounded-xl border bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors duration-200";

export default function Field({
  label,
  hint,
  value,
  onChange,
  required,
  multiline,
  error,
}: FieldProps) {
  const border = error
    ? "border-red-400/60 focus:border-red-400"
    : "border-white/10 focus:border-cyan-300/60";
  const inputCls = `${inputBase} ${border}`;
  return (
    <div>
      <label className="block text-xs uppercase tracking-[0.2em] text-neutral-400">
        {label}
        {required ? " *" : ""}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputCls}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={inputCls}
        />
      )}
      {error ? (
        <p className="mt-1 text-xs text-red-300">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}
