/** A grantable capability, slugged "<group>:<action>" — e.g. "territory:read". */
export type Permission = {
  slug: string;
  description?: string;
};

export type PermissionGroup = {
  name: string;
  permissions: Permission[];
};

/** The part before the colon — what the permission is about. */
export const groupOf = (slug: string) => slug.split(":")[0];

/** The part after the colon — what it lets you do. A bare slug is its own action. */
export const actionOf = (slug: string) => slug.split(":")[1] ?? slug;

/** Groups permissions by their prefix, keeping first-seen order in both axes. */
export function groupPermissions(permissions: Permission[]): PermissionGroup[] {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const name = groupOf(permission.slug);
    groups.set(name, [...(groups.get(name) ?? []), permission]);
  }
  return [...groups].map(([name, perms]) => ({ name, permissions: perms }));
}
