import type { components } from "@/shared/api/dto";
import type { User } from "../model/user";

type AuthUserDto = components["schemas"]["AuthUser"];

// The admin list item is the same wire shape as the principal, minus what
// only the signed-in caller needs (permissions, tours, csrf). `?? null` for
// the two tri-state factors: absent means the owning service did not answer.
export function toUser(d: AuthUserDto): User {
  return {
    id: d.id,
    username: d.username,
    email: d.email,
    status: d.status,
    totpEnabled: d.totpEnabled ?? null,
    passkeyEnabled: d.passkeyEnabled ?? null,
    totpRequired: d.totpRequired,
    roleSlugs: d.roleSlugs,
    roleTitles: d.roleTitles ?? {},
    isOwner: d.isOwner,
  };
}
