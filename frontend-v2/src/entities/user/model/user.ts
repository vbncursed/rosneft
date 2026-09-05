export type UserStatus = "active" | "frozen" | "deleted";

/**
 * Tri-state, not a boolean. `null` means the owning service could not be
 * reached, so the answer is unknown — never collapse it to false. A confident
 * wrong "off" in the admin console is the bug this shape exists to prevent.
 */
export type Known = boolean | null;

export type User = {
  id: string;
  username: string;
  email: string;
  status: UserStatus;
  totpEnabled: Known;
  passkeyEnabled: Known;
  /** Policy, not fact: the account must carry a second factor. Always known. */
  totpRequired: boolean;
  roleSlugs: string[];
  /**
   * Slug → display title. The slug is not an abbreviation of the title: the
   * slug "admin" is titled "Company Owner". A slug missing here means the role
   * was deleted after it was granted — show the slug rather than nothing.
   */
  roleTitles: Record<string, string>;
  isOwner: boolean;
};

export const STATUS_TONE = {
  active: "ok",
  frozen: "warn",
  deleted: "dim",
} as const;

/** What a tri-state column reads as: yes, no, or "we could not find out". */
export function knownLabel(value: Known): "Yes" | "No" | "—" {
  if (value === null) return "—";
  return value ? "Yes" : "No";
}

export const KNOWN_TONE = { true: "ok", false: "bad", null: "dim" } as const;

export const knownTone = (value: Known) => KNOWN_TONE[String(value) as keyof typeof KNOWN_TONE];

/** A granted role's display title, falling back to the slug it was granted as. */
export const roleTitle = (user: User, slug: string) => user.roleTitles[slug] ?? slug;
