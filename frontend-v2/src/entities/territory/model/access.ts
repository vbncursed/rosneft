/** Who can open a territory. */
export type Visibility = "assigned" | "company" | "private";

/** How a person came by their access. */
export type GrantVia = "direct" | "role" | "owner";

export type AccessGrant = {
  userId: string;
  username: string;
  /** Their role's display title, e.g. "Field Operator". */
  roleTitle: string;
  via: GrantVia;
  /** A frozen or deleted account still holds the grant; the row dims. */
  inactive?: boolean;
};

export type TerritoryAccess = {
  slug: string;
  title: string;
  visibility: Visibility;
  /** The mono line under the title. */
  meta: string;
  /** Usernames whose initials stack on the row. */
  faces: string[];
  /** How many can open it, worded for the visibility, e.g. "26 accounts". */
  peopleLabel: string;
};

export const VISIBILITY_TONE = {
  assigned: "accent",
  company: "ok",
  private: "neutral",
} as const;

export const VISIBILITY_TITLE: Record<Visibility, string> = {
  assigned: "Assigned people",
  company: "Whole company",
  private: "Owner only",
};

/**
 * Only a direct grant can be taken away here. Ownership is inherent and a
 * role-granted one belongs to the role — revoking it on one territory would
 * quietly disagree with every other territory that role reaches.
 */
export const isRevocable = (grant: AccessGrant) => grant.via === "direct";

/** What the row's trailing control says when it cannot revoke. */
export function grantAction(grant: AccessGrant): "remove" | "pinned" | "locked" {
  if (grant.via === "owner") return "pinned";
  if (grant.via === "role") return "locked";
  return "remove";
}

/** Whether the panel needs to explain why some rows cannot be revoked. */
export const hasInheritedGrants = (grants: AccessGrant[]) =>
  grants.some((grant) => grant.via === "role");
