import { lazy, Suspense } from "react";
import ViewerSkeleton from "@/viewer/presentation/components/viewer-skeleton";
import type { ModelViewerProps } from "@/viewer/presentation/components/model-viewer";

// model-viewer pulls three/R3F — code-split it so the viewer chunk loads on
// demand. (Vite has no SSR, so next/dynamic's ssr:false is moot here.)
const importModelViewer = () => import("@/viewer/presentation/components/model-viewer");
const ModelViewer = lazy(importModelViewer);

// preloadModelViewer warms that chunk before anything renders it.
//
// Without it, opening a territory replaced the catalog with the Suspense
// fallback — a "Loading interface…" card — for as long as the ~1.2 MB chunk
// took to arrive. next/link used to prefetch route JS on hover, so the Next
// build never showed that step. Callers on pages that lead into the viewer
// fire this once; the dynamic import is memoised, so later calls and the
// lazy() mount reuse the same promise and resolve instantly.
export function preloadModelViewer(): void {
  void importModelViewer();
}

export default function ViewerEntry(props: ModelViewerProps) {
  return (
    <Suspense fallback={<ViewerSkeleton />}>
      <ModelViewer {...props} />
    </Suspense>
  );
}
