import { queryOptions } from "@tanstack/react-query";
import { getModel, listModelArtifacts } from "@/model/infrastructure/model-gateway";

export const modelQuery = (slug: string) =>
  queryOptions({ queryKey: ["model", slug], queryFn: () => getModel(slug) });

// Artifacts may 404/500 while conversion runs — mirror the old page's
// `.catch(() => [])` so the detail component always gets an array.
export const modelArtifactsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["model-artifacts", slug],
    queryFn: () => listModelArtifacts(slug).catch(() => []),
  });
