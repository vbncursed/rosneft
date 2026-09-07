import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePassword, meQuery, twoFactorQuery } from "@/entities/user";
import { passkeysQuery } from "@/entities/passkey";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import type { AccountPageProps } from "../ui/account-page";

export type { AccountPageProps };

export type AccountState =
  | { phase: "loading" }
  | { phase: "unavailable"; error: string }
  | ({ phase: "ready" } & AccountPageProps);

/**
 * The account screen's data: the principal, the 2FA posture and the passkey
 * count, plus the password-change mutation. `me.isPending` is provably
 * false by the time this ever renders in production — `catalogRoute`'s
 * loader awaits `ensureQueryData(meQuery)` before the route mounts — but the
 * "loading" branch stays: it is what that phase's own tests exercise, and
 * it is still correct if that loader guarantee ever changes. The two side
 * queries carry no such guarantee, which is why they get their own
 * `twoFactorLoading`/`passkeysLoading` flags instead of gating the whole
 * page — a failed side query degrades to "unknown" rather than blanking it.
 */
export function useAccount(): AccountState {
  const client = useQueryClient();
  const me = useQuery(meQuery);
  const twoFactor = useQuery(twoFactorQuery);
  const passkeys = useQuery(passkeysQuery);

  const password = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) => changePassword(current, next),
    onSuccess: () => notify.success("Password changed"),
    onError: (err) => {
      notify.error(messageOf(err));
      // A dead session 401s here exactly the same as a wrong current
      // password does (both are now `credentialed`, so neither bounced on
      // its own). Asking `me` again either confirms the session is fine —
      // it was just a wrong password — or takes the ordinary 401 path
      // itself and bounces within one round trip.
      void client.invalidateQueries(meQuery);
    },
  });

  if (me.isPending) return { phase: "loading" };
  const meError = unanswered(me);
  if (meError) return { phase: "unavailable", error: messageOf(meError) };

  return {
    phase: "ready",
    me: me.data!,
    // A failed side query is null, not false: the cards say "unknown" rather
    // than reporting a factor off we never managed to ask about.
    twoFactor: twoFactor.data ?? null,
    passkeys: passkeys.data ?? null,
    // Still in flight is a third state, distinct from "answered null": the
    // card draws a skeleton rather than a confident "—".
    twoFactorLoading: twoFactor.isPending,
    passkeysLoading: passkeys.isPending,
    passwordBusy: password.isPending,
    // mutateAsync, not mutate: the form only clears on a resolved promise —
    // a wrong current password or a dropped connection must leave both
    // fields as the user typed them.
    onChangePassword: (current, next) => password.mutateAsync({ current, next }),
  };
}
