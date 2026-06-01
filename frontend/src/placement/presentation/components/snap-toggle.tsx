interface SnapToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

// Horseshoe-magnet glyph — communicates "attract to surface" more clearly
// than a generic snap arrow, and pairs visually with the on/off colour
// shift below.
function MagnetIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3v8a7 7 0 0 0 14 0V3" />
      <line x1="5" y1="3" x2="9" y2="3" />
      <line x1="15" y1="3" x2="19" y2="3" />
      <line x1="5" y1="7" x2="9" y2="7" />
      <line x1="15" y1="7" x2="19" y2="7" />
    </svg>
  );
}

export default function SnapToggle({ enabled, onChange }: SnapToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      title={enabled ? "Surface snap on (G to disable)" : "Surface snap off (G to enable)"}
      aria-pressed={enabled}
      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
        enabled
          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-50 hover:bg-emerald-400/20"
          : "border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/10"
      }`}
    >
      <span className="flex items-center gap-2">
        <MagnetIcon />
        <span>Snap to surface</span>
      </span>
      <kbd className="rounded border border-white/15 px-1 text-[10px] text-neutral-400">G</kbd>
    </button>
  );
}
