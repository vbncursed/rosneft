import type { components } from "@/shared/api/dto";
import type { Principal } from "@/shared/session";

type AuthUserDto = components["schemas"]["AuthUser"];

// One of two mappers over AuthUser — the other is to-user.ts, for the admin
// list item. `?? null` for the two tri-state fields — an absent key means the
// owning service could not answer, and
// mapping it to false would render a confident "off" for a user who has it
// on. totpRequired is a plain boolean: it is a column on the user's own row
// and is always known. roleSlugs/permissions default to `[]`: the schema
// says array, but a Go nil slice marshals to JSON `null`, and the gateway
// sends exactly that for an owner who holds no roles.
export function toPrincipal(d: AuthUserDto): Principal {
  return {
    id: d.id,
    email: d.email,
    username: d.username,
    status: d.status,
    totpEnabled: d.totpEnabled ?? null,
    totpRequired: d.totpRequired,
    passkeyEnabled: d.passkeyEnabled ?? null,
    roleSlugs: d.roleSlugs ?? [],
    roleTitles: d.roleTitles ?? {},
    permissions: d.permissions ?? [],
    isOwner: d.isOwner,
    onboardingToursSeen: d.onboardingToursSeen ?? [],
  };
}
