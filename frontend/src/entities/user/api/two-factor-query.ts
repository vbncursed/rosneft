import { queryOptions } from "@tanstack/react-query";
import { twoFactorStatus } from "./account-gateway";

/** The 2FA posture, invalidated by every flow that changes it. */
export const twoFactorQuery = queryOptions({ queryKey: ["two-factor"], queryFn: twoFactorStatus });
