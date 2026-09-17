import { queryOptions } from "@tanstack/react-query";
import { listModels } from "./models-gateway";

export const modelsQuery = queryOptions({ queryKey: ["models"], queryFn: listModels });
