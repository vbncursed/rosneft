export interface Principal {
  id: string;
  email: string;
  username: string;
  status: "active" | "frozen" | "deleted";
  // Tri-state. null means the owning service could not be reached, so the
  // status is unknown — never collapse it to false. A confident wrong "off" in
  // the admin console is the bug this field was widened to fix.
  totpEnabled: boolean | null;
  // Whether the user has at least one passkey. null = unknown, and always null
  // on /api/auth/me, which does not fetch it.
  passkeyEnabled: boolean | null;
  roleSlugs: string[];
  // Slug → display title for each entry in roleSlugs. The slug is not an
  // abbreviation of the title: slug "admin" is titled "Company Owner", while a
  // different role is slugged "owner". A slug missing here means the role was
  // deleted after it was granted — show the slug rather than nothing.
  roleTitles: Record<string, string>;
  permissions: string[];
  isOwner: boolean;
  // Ids of the first-run tours this user has finished or skipped.
  onboardingToursSeen: string[];
}

export function can(p: Principal | null, permission: string): boolean {
  // Owners are the root of trust and may do anything — mirrors the backend's
  // owner bypass and canGrant() below, so a Root with no roles isn't locked out.
  return !!p && (p.isOwner || p.permissions.includes(permission));
}

// No-privilege-escalation, mirrored client-side so the UI never offers a grant
// the backend would reject. Owners are the root of trust and may grant anything.
export function canGrant(p: Principal | null, permissions: string[]): boolean {
  if (!p) return false;
  if (p.isOwner) return true;
  return permissions.every((perm) => p.permissions.includes(perm));
}
