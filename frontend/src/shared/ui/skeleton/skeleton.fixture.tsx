import { PageSkeleton } from "./page-skeleton";
import { Skeleton } from "./skeleton";

export default {
  bars: (
    <div className="flex max-w-md flex-col gap-2 rounded-card border border-line bg-panel p-6">
      <Skeleton width="60%" />
      <Skeleton width="85%" />
      <Skeleton height="80px" rounded="md" />
      <p className="m-0 font-mono text-[10px] text-dim">skeleton</p>
    </div>
  ),
  console: (
    <div className="p-6">
      <PageSkeleton shape="console" label="Loading people" />
    </div>
  ),
  journal: (
    <div className="p-6">
      <PageSkeleton shape="journal" label="Loading journal" />
    </div>
  ),
  form: (
    <div className="p-6">
      <PageSkeleton shape="form" label="Loading territory" />
    </div>
  ),
  catalog: (
    <div className="p-6">
      <PageSkeleton shape="catalog" label="Loading territories" />
    </div>
  ),
};
