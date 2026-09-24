import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/entities/user";
import { useSignOut } from "@/features/sign-out";
import { TwoFactorRequiredPage } from "./two-factor-required-page";

/**
 * The route leaf. The route's beforeLoad has already sent everyone who
 * belongs elsewhere away (no session → /login; not required, or ?stage=done
 * without two-factor on → /), so what is left is "done" once two-factor is on
 * and the gate otherwise — an unknown enrolment included.
 */
export function TwoFactorRequiredScreen() {
  const me = useQuery(meQuery).data;
  const { signOut, pending } = useSignOut();
  if (!me) return null;
  return (
    <TwoFactorRequiredPage
      stage={me.totpEnabled === true ? "done" : "gate"}
      username={me.username}
      onSignOut={() => void signOut()}
      signingOut={pending}
    />
  );
}
