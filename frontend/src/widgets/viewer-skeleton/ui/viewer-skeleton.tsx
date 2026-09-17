import { ProgressBar } from "@/shared/ui/progress-bar";
import { Skeleton } from "@/shared/ui/skeleton";

export type ViewerSkeletonProps = {
  /** 0–100. Omit while the loader has not reported anything yet. */
  progress?: number;
  label?: string;
};

/**
 * What stands in for the scene while the GLB and the interface come down: the
 * mock's 380 px card, centred in the viewport it will fill.
 *
 * Two grey lines rather than a bar alone — a card holding only a headline and
 * a track reads as a failure, while a shape roughly the size of what is coming
 * reads as work in progress.
 */
export function ViewerSkeleton({ progress, label = "Loading interface…" }: ViewerSkeletonProps) {
  return (
    <div className="flex w-[380px] max-w-full flex-col gap-3 rounded-card border border-line bg-panel p-[22px] shadow-elevation">
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <ProgressBar variant="thin" ariaLabel={label} {...(progress === undefined ? {} : { value: progress })} />
      <Skeleton width="72%" height="9px" />
      <Skeleton width="54%" height="9px" />
    </div>
  );
}
