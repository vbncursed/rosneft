import type { components } from "@/shared/api/dto";
import type { Principal } from "@/shared/session";

type AuthUserDto = components["schemas"]["AuthUser"];

// The only place a DTO becomes a domain type. `?? null` for the two tri-state
// fields — an absent key means the owning service could not answer, and
// mapping it to false would render a confident "off" for a user who has it
// on. totpRequired is a plain boolean: it is a column on the user's own row
// and is always known.
export function toPrincipal(d: AuthUserDto): Principal {
  return {
    id: d.id,
    email: d.email,
    username: d.username,
    status: d.status,
    totpEnabled: d.totpEnabled ?? null,
    totpRequired: d.totpRequired,
    passkeyEnabled: d.passkeyEnabled ?? null,
    roleSlugs: d.roleSlugs,
    roleTitles: d.roleTitles ?? {},
    permissions: d.permissions,
    isOwner: d.isOwner,
    onboardingToursSeen: d.onboardingToursSeen ?? [],
  };
}
