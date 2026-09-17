export type Principal = {
  id: string;
  email: string;
  username: string;
  status: "active" | "frozen" | "deleted";
  /**
   * Tri-state. `null` means the owning service could not be reached, so the
   * answer is unknown — never collapse it to false. A confident wrong "off"
   * in the console is the bug this shape exists to prevent.
   */
  totpEnabled: boolean | null;
  /**
   * Policy, not fact: an administrator requires a second factor of this
   * account. Always known, because it is a column on the user's own row —
   * which is why it is a plain boolean beside two that are not.
   */
  totpRequired: boolean;
  /** Whether the user has at least one passkey. `null` = unknown. */
  passkeyEnabled: boolean | null;
  roleSlugs: string[];
  /**
   * Slug → display title. The slug is not an abbreviation of the title: slug
   * "admin" is titled "Company Owner", while a different role is slugged
   * "owner". A slug missing here means the role was deleted after it was
   * granted — show the slug rather than nothing.
   */
  roleTitles: Record<string, string>;
  permissions: string[];
  isOwner: boolean;
  onboardingToursSeen: string[];
};

/** Owners are the root of trust and may do anything, mirroring the gateway. */
export const can = (p: Principal | null, permission: string): boolean =>
  !!p && (p.isOwner || p.permissions.includes(permission));

/**
 * Which permissions this principal may hand out. Mirrors the backend's
 * no-escalation rule so the matrix never offers a grant the gateway would
 * refuse: an owner may grant anything, everyone else exactly what they hold.
 */
export const grantableSlugs = (
  me: Principal | null,
  permissions: readonly { slug: string }[],
): Set<string> => new Set(permissions.map((p) => p.slug).filter((slug) => can(me, slug)));

/**
 * The identity a screen shows for the signed-in reader: the console sidebar's
 * foot, the account header's meta line and Home's account pill all read it
 * from here, so the fallbacks ("Root" for an ownerless owner, "—" otherwise)
 * are decided once.
 */
/** Who is signed in, as every surface that shows an identity draws it. */
export type Viewer = { username: string; roleTitle: string };

export function viewerOf(me: Principal): Viewer {
  const first = me.roleSlugs[0];
  const roleTitle = first ? (me.roleTitles[first] ?? first) : me.isOwner ? "Root" : "—";
  return { username: me.username, roleTitle };
}
