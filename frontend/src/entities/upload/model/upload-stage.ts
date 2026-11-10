type Phase = "idle" | "picked" | "uploading" | "finalizing" | "creating" | "replacing";

const CURRENT_STAGE: Record<Phase, number> = {
  idle: -1,
  picked: -1,
  uploading: 0,
  finalizing: 1,
  creating: 2,
  replacing: 2,
};

export function uploadStageAt(
  index: number,
  phase: Phase,
  pendingTime: string,
  percent: number | null = null,
): { state: "pending" | "active" | "done"; time: string } {
  const current = CURRENT_STAGE[phase];
  if (index >= 2 || index > current) return { state: "pending", time: pendingTime };
  if (index < current) return { state: "done", time: "done" };
  return { state: "active", time: index === 0 && percent !== null ? `${percent}%` : "running" };
}
