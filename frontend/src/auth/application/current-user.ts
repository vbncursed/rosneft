import "server-only";
import { getMe } from "@/auth/infrastructure/auth-gateway";
import type { Principal } from "@/auth/domain/principal";

// Returns the signed-in principal, or null when there is no valid session
// (e.g. on /login). Never throws.
export async function getCurrentUser(): Promise<Principal | null> {
  try {
    return await getMe();
  } catch {
    return null;
  }
}
