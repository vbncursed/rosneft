import { lazy, Suspense } from "react";
import ViewerSkeleton from "@/viewer/presentation/components/viewer-skeleton";
import type { ModelViewerProps } from "@/viewer/presentation/components/model-viewer";

// model-viewer pulls three/R3F — code-split it so the viewer chunk loads on
// demand. (Vite has no SSR, so next/dynamic's ssr:false is moot here.)
const ModelViewer = lazy(() => import("@/viewer/presentation/components/model-viewer"));

export default function ViewerEntry(props: ModelViewerProps) {
  return (
    <Suspense fallback={<ViewerSkeleton />}>
      <ModelViewer {...props} />
    </Suspense>
  );
}
