import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { myAuditQuery } from "@/entities/audit";
import { changePassword, disable2FA, meQuery, twoFactorQuery } from "@/entities/user";
import { passkeysQuery, removePasskey } from "@/entities/passkey";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";
import { pageCount, pageSlice, rowsNeeded } from "./paging";
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
  const activity = useInfiniteQuery(myAuditQuery);

  // The pager may ask for a page the cache does not hold yet. The gateway
  // pages by cursor and only forwards, so the pages in between are fetched in
  // order until the asked-for one is in — one request in flight at a time.
  // `isFetchNextPageError` stops the walk on a refusal: without it the effect
  // sees the rows it still needs, asks again, fails again, and loops against
  // the gateway with nothing on screen to show for it.
  const [page, setPage] = useState(1);
  const loaded = (activity.data?.pages ?? []).flatMap((p) => p.entries);
  const total = activity.data?.pages[0]?.total ?? null;
  // Clamped on render, not in the setter: a feed that shrank under an
  // invalidation lands on its new last page rather than an empty slice.
  const shownPage = Math.min(page, pageCount(total ?? 0));
  // Read once and used twice: the effect starts the request, and `activityBusy`
  // reports it. They have to agree — the frame between the click and the effect
  // holds an empty slice with no request in flight yet, and a `busy` that only
  // watched the query flashed "this page could not be loaded" on every jump.
  const walking =
    rowsNeeded(shownPage) > loaded.length && activity.hasNextPage && !activity.isFetchNextPageError;
  useEffect(() => {
    if (walking && !activity.isFetching) void activity.fetchNextPage();
  }, [walking, activity]);

  // Every mutation invalidates what another surface reads. The journal is one
  // of those surfaces: this screen prints it three sections lower, so a change
  // the gateway records must also re-ask for the feed, or the reader is shown
  // a history missing the event they just caused.
  //
  // It hangs off `onSettled`, not `onSuccess`, and every mutation here carries
  // that one line: authhttp/audit.go journals refusals as well (result
  // "failed", which `summaryOf` prints), so a failed change is an event too.
  // Naming the keys once is what keeps the next mutation from omitting them.
  const afterJournalledChange = () => void client.invalidateQueries({ queryKey: ["audit", "mine"] });

  const password = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) => changePassword(current, next),
    onSuccess: () => notify.success("Password changed"),
    onError: (err) => {
      notify.error(messageOf(err));
      // changePassword is `credentialed` — the gateway answers 401 for a
      // wrong current password, so nothing bounced on its own. Asking `me`
      // again either confirms the session is fine (it was just a wrong
      // password) or takes the ordinary 401 path and bounces within one
      // round trip.
      void client.invalidateQueries(meQuery);
    },
    onSettled: afterJournalledChange,
  });

  // Two-factor changes also move `me.totpEnabled`, which is what decides
  // whether a passkey removal asks for a code or a password — leaving it stale
  // is how the old screen ended up asking for the wrong one.
  const afterTwoFactorChange = () => {
    void client.invalidateQueries({ queryKey: ["two-factor"] });
    void client.invalidateQueries({ queryKey: ["me"] });
  };

  const disable = useMutation({
    mutationFn: (code: string) => disable2FA(code),
    onSuccess: () => {
      notify.success("Two-factor disabled");
      afterTwoFactorChange();
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: afterJournalledChange,
  });

  const removal = useMutation({
    mutationFn: ({ id, credential }: { id: string; credential: { code?: string; password?: string } }) =>
      removePasskey(id, credential),
    onSuccess: () => {
      notify.success("Passkey removed");
      void client.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (err) => notify.error(messageOf(err)),
    onSettled: afterJournalledChange,
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
    // Flattened here rather than in the page: the page is props-only, and the
    // page shape of an infinite query is this hook's business.
    //
    // null when the feed never answered — every Guest lacks `audit:read_own`
    // (auth-service migration 00013) and takes a 403 here, and an empty list
    // would tell them nothing had ever happened under their own account.
    // `unanswered`, not `isError`: a failed *load more* leaves the pages
    // already on screen alone.
    activity: unanswered(activity) ? null : pageSlice(loaded, shownPage),
    activityTotal: unanswered(activity) ? null : total,
    activityPage: shownPage,
    activityPageCount: pageCount(total ?? 0),
    // isPending covers the first load, which has neither rows nor an error and
    // would otherwise read as "nothing recorded"; isFetchingNextPage covers the
    // walk to a far page. Not isFetching: every mutation here invalidates the
    // feed, and a background refetch must not disable a pager whose rows are
    // already on screen.
    activityBusy: activity.isPending || activity.isFetchingNextPage || walking,
    passwordBusy: password.isPending,
    disableBusy: disable.isPending,
    removalBusy: removal.isPending,
    // mutateAsync, not mutate: the form only clears on a resolved promise —
    // a wrong current password or a dropped connection must leave both
    // fields as the user typed them.
    onChangePassword: (current, next) => password.mutateAsync({ current, next }),
    // mutateAsync for the same reason: each modal closes on a resolved
    // promise, so a refused code leaves the dialog open with the digits in it.
    onDisable2FA: (code) => disable.mutateAsync(code),
    onRemovePasskey: (id, credential) => removal.mutateAsync({ id, credential }),
    onPasskeyAdded: () => {
      void client.invalidateQueries({ queryKey: ["passkeys"] });
      afterJournalledChange();
    },
    onPage: setPage,
  };
}
