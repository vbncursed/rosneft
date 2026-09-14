import { Skeleton } from "./skeleton";

export default (
  <div className="flex max-w-md flex-col gap-2 rounded-card border border-line bg-panel p-6">
    <Skeleton width="60%" />
    <Skeleton width="85%" />
    <Skeleton height="80px" rounded="md" />
    <p className="m-0 font-mono text-[10px] text-dim">skeleton</p>
  </div>
);
