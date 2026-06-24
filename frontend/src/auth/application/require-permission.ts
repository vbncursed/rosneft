import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";

// requirePermission guards a server route: if the current user lacks the
// permission, it redirects away (the gateway also enforces the mutation, so
// this is UX, not the security boundary). Use at the top of mutation pages.
export async function requirePermission(permission: string, to = "/"): Promise<void> {
  if (!can(await getCurrentUser(), permission)) redirect(to);
}
