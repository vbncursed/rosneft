import { Card } from "@/shared/ui/card";
import { ProgressBar } from "@/shared/ui/progress-bar";

export type ViewerSkeletonProps = {
  /** 0–100. Omit while the loader has not reported anything yet. */
  progress?: number;
  label?: string;
};

/** What stands in for the scene while the GLB and the interface come down. */
export function ViewerSkeleton({ progress, label = "Loading interface…" }: ViewerSkeletonProps) {
  return (
    <Card className="flex flex-col gap-2.5">
      <p className="m-0 text-[13px] font-semibold text-fg">{label}</p>
      <ProgressBar value={progress} ariaLabel={label} />
      <p className="m-0 font-mono text-[10px] text-dim">viewer skeleton</p>
    </Card>
  );
}
