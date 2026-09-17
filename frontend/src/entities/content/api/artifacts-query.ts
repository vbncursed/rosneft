import { queryOptions } from "@tanstack/react-query";
import type { ContentKind } from "../model/content-item";
import { listArtifacts } from "./artifacts-gateway";

/** One entry per catalog row; the browser's ETag keeps refetches cheap. */
export const artifactsQuery = (kind: ContentKind, slug: string) =>
  queryOptions({ queryKey: ["artifacts", kind, slug], queryFn: () => listArtifacts(kind, slug) });
