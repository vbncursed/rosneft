import { ViewerSkeleton } from "./ui/viewer-skeleton";

export default (
  <div className="grid max-w-2xl gap-4 md:grid-cols-2">
    <ViewerSkeleton progress={45} />
    <ViewerSkeleton />
  </div>
);
