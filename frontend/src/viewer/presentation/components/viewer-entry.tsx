"use client";

import dynamic from "next/dynamic";
import ViewerSkeleton from "@/viewer/presentation/components/viewer-skeleton";
import type { ModelViewerProps } from "@/viewer/presentation/components/model-viewer";

const ModelViewer = dynamic(
  () => import("@/viewer/presentation/components/model-viewer"),
  {
    ssr: false,
    loading: () => <ViewerSkeleton />,
  },
);

export default function ViewerEntry(props: ModelViewerProps) {
  return <ModelViewer {...props} />;
}
