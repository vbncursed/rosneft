import { useQuery } from "@tanstack/react-query";
import { meQuery } from "@/entities/user";
import { useSignOut } from "@/features/sign-out";
import { mustEnroll } from "@/shared/session";
import { TwoFactorRequiredPage } from "./two-factor-required-page";

/**
 * The route leaf. The route's beforeLoad has already sent everyone who
 * belongs elsewhere away (no session → /login; enrolled without ?stage=done → /),
 * so what is left is the gate while enrolment is owed, "done" once it is not.
 */
export function TwoFactorRequiredScreen() {
  const me = useQuery(meQuery).data;
  const { signOut, pending } = useSignOut();
  if (!me) return null;
  return (
    <TwoFactorRequiredPage
      stage={mustEnroll(me) ? "gate" : "done"}
      username={me.username}
      onSignOut={() => void signOut()}
      signingOut={pending}
    />
  );
}
