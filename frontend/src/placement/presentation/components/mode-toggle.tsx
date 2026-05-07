import type { GizmoMode } from "@/placement/domain/gizmo-mode";

interface ModeToggleProps {
  mode: GizmoMode;
  onChange: (mode: GizmoMode) => void;
}

interface ModeButton {
  value: GizmoMode;
  label: string;
  key: string;
  hint: string;
}

// Plain capital-letter labels rather than icons keeps the component
// dependency-free and the keyboard hint (T/R/S) stays obvious.
const BUTTONS: ModeButton[] = [
  { value: "translate", label: "Move", key: "T", hint: "Translate" },
  { value: "rotate", label: "Rotate", key: "R", hint: "Rotate" },
  { value: "scale", label: "Scale", key: "S", hint: "Scale" },
];

export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1">
      {BUTTONS.map((b) => {
        const active = b.value === mode;
        return (
          <button
            key={b.value}
            type="button"
            onClick={() => onChange(b.value)}
            title={`${b.hint} (${b.key})`}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
              active
                ? "bg-white/15 text-white"
                : "text-neutral-300 hover:bg-white/10"
            }`}
          >
            <span>{b.label}</span>
            <kbd className="rounded border border-white/15 px-1 text-[10px] text-neutral-400">
              {b.key}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
