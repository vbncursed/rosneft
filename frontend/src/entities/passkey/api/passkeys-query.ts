import { queryOptions } from "@tanstack/react-query";
import { listPasskeys } from "./passkey-gateway";

export const passkeysQuery = queryOptions({ queryKey: ["passkeys"], queryFn: listPasskeys });
