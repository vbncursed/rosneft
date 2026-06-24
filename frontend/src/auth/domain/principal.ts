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
