import { queryOptions } from "@tanstack/react-query";
import { listModels } from "@/model/infrastructure/model-gateway";

export const modelsQuery = queryOptions({
  queryKey: ["models"],
  queryFn: listModels,
});
