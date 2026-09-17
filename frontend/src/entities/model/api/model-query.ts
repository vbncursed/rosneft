import { queryOptions } from "@tanstack/react-query";
import { getModel } from "./models-gateway";

export const modelQuery = (slug: string) =>
  queryOptions({ queryKey: ["model", slug], queryFn: () => getModel(slug) });
