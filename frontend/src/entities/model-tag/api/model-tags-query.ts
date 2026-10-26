import { queryOptions } from "@tanstack/react-query";
import { httpGet } from "@/shared/api";
import type * as Dto from "@/shared/api/dto";
import { toModelTag } from "./to-model-tag";

/** The fixed tag list, already sorted by the gateway (title, `ungrouped` last). */
export const modelTagsQuery = () =>
  queryOptions({
    queryKey: ["model-tags"],
    queryFn: async () => (await httpGet<Dto.ModelTag[]>("/api/model-tags")).map(toModelTag),
  });
