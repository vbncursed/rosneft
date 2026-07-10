import { memo } from "react";

interface MeasureButtonProps {
  active: boolean;
  onClick: () => void;
}

function MeasureButtonImpl({ active, onClick }: MeasureButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title="Measure (M)"
      data-tour="measure"
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
        active
          ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20"
          : "border-white/25 bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {/* Hand-drawn ruler glyph as inline SVG keeps the UI emoji-free and
          consistent regardless of the user's font stack. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="9" width="20" height="6" rx="1" />
        <path d="M6 9v3M9 9v2M12 9v3M15 9v2M18 9v3" />
      </svg>
      <span>{active ? "Measuring" : "Measure"}</span>
      <kbd className="rounded border border-current/40 px-1 text-[10px] opacity-70">
        M
      </kbd>
    </button>
  );
}

export default memo(MeasureButtonImpl);
