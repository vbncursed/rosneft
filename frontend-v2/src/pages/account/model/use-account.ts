import { useMutation, useQuery } from "@tanstack/react-query";
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
 * count, plus the password-change mutation. Only `me` gates the page — the
 * password form and (in a later task) the activity feed work without the
 * other two, so a failed side query degrades to "unknown" rather than
 * blanking the screen.
 */
export function useAccount(): AccountState {
  const me = useQuery(meQuery);
  const twoFactor = useQuery(twoFactorQuery);
  const passkeys = useQuery(passkeysQuery);

  const password = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) => changePassword(current, next),
    onSuccess: () => notify.success("Password changed"),
    onError: (err) => notify.error(messageOf(err)),
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
    passwordBusy: password.isPending,
    onChangePassword: (current, next) => password.mutate({ current, next }),
  };
}
