import type { Principal } from "@/auth/domain/principal";

// The admin user-list item has the same shape as the signed-in principal.
export type AdminUser = Principal;
