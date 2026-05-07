import { memo } from "react";

interface LoadingProgressProps {
  progress: number;
}

function LoadingProgressImpl({ progress }: LoadingProgressProps) {
  const normalized = Math.max(0, Math.min(100, progress));
  const progressRatio = normalized / 100;

  return (
    <div className="rounded-xl border border-white/20 bg-black/45 p-4 shadow-xl backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Loading model</p>
      <p className="mt-1 text-base font-semibold text-white">{normalized.toFixed(1)}%</p>
      <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-white/15 sm:w-72">
        <div
          className="h-full origin-left rounded-full bg-cyan-300 transition-transform duration-200"
          style={{ transform: `scaleX(${progressRatio})` }}
        />
      </div>
    </div>
  );
}

export default memo(LoadingProgressImpl);
