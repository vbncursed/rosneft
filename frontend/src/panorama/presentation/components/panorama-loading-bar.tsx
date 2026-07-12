import { memo } from "react";

interface PanoramaLoadingBarProps {
  // 0–100, or null for indeterminate (server sent no Content-Length).
  progress: number | null;
}

// Copied from viewer's LoadingProgress rather than imported: cross-context
// presentation imports aren't sanctioned by CLAUDE.md's layering rules, and
// this variant adds an indeterminate state the original doesn't have.
function PanoramaLoadingBarImpl({ progress }: PanoramaLoadingBarProps) {
  const indeterminate = progress === null;
  const normalized = indeterminate ? 0 : Math.max(0, Math.min(100, progress));

  return (
    <div className="rounded-xl border border-white/20 bg-black/45 p-4 shadow-xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Loading panorama</p>
      <p className="mt-1 text-base font-semibold text-white">
        {indeterminate ? "…" : `${normalized.toFixed(0)}%`}
      </p>
      <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-white/15 sm:w-72">
        {indeterminate ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-300" />
        ) : (
          <div
            className="h-full origin-left rounded-full bg-cyan-300 transition-transform duration-200"
            style={{ transform: `scaleX(${normalized / 100})` }}
          />
        )}
      </div>
    </div>
  );
}

export default memo(PanoramaLoadingBarImpl);
