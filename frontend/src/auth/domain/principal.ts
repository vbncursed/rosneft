export interface Principal {
  id: string;
  email: string;
  username: string;
  status: "active" | "frozen" | "deleted";
  totpEnabled: boolean;
  roleSlugs: string[];
  permissions: string[];
  isOwner: boolean;
}

export function can(p: Principal | null, permission: string): boolean {
  return !!p && p.permissions.includes(permission);
}

// No-privilege-escalation, mirrored client-side so the UI never offers a grant
// the backend would reject. Owners are the root of trust and may grant anything.
export function canGrant(p: Principal | null, permissions: string[]): boolean {
  if (!p) return false;
  if (p.isOwner) return true;
  return permissions.every((perm) => p.permissions.includes(perm));
}
