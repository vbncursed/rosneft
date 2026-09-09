import type { AuditEntry } from "@/entities/audit";
import type { Passkey } from "@/entities/passkey";
import type { TwoFactorStatus } from "@/entities/user";
import type { Principal } from "@/shared/session";
import { useState } from "react";
import { pageSummary } from "../model/paging";
import { postureCards } from "../model/posture";
import { AccountHeader } from "./account-header";
import { ActivitySection } from "./activity-section";
import { DisableTwoFactorModal } from "./disable-two-factor-modal";
import { PasskeysSection } from "./passkeys-section";
import { PasswordSection } from "./password-section";
import { PostureCards } from "./posture-cards";
import { TwoFactorSection } from "./two-factor-section";

export type AccountPageProps = {
  me: Principal;
  twoFactor: TwoFactorStatus | null;
  passkeys: Passkey[] | null;
  /** Still in flight — distinct from "answered null": the card draws a skeleton. */
  twoFactorLoading: boolean;
  passkeysLoading: boolean;
  /**
   * The current page of the caller's own journal, newest first. null is "we
   * could not find out" — a Guest's 403, not an empty history.
   */
  activity: AuditEntry[] | null;
  /** Every event the feed holds, which is what the summary counts. null when it never answered. */
  activityTotal: number | null;
  activityPage: number;
  activityPageCount: number;
  /** A page is on its way — distinct from a background refetch, which leaves the pager live. */
  activityBusy: boolean;
  passwordBusy: boolean;
  disableBusy: boolean;
  removalBusy: boolean;
  /** Resolves only on success — the form clears its fields off this, never unconditionally. */
  onChangePassword: (current: string, next: string) => Promise<void>;
  /** Resolves only on success — the modal closes off this, never on a refused code. */
  onDisable2FA: (code: string) => Promise<void>;
  onRemovePasskey: (id: string, credential: { code?: string; password?: string }) => Promise<void>;
  onPasskeyAdded: () => void;
  onPage: (page: number) => void;
};

/** The account screen's content: identity, posture, password, 2FA, passkeys, activity. Draws no chrome. */
export function AccountPage(props: AccountPageProps) {
  const [disabling, setDisabling] = useState(false);

  const disable = async (code: string) => {
    try {
      await props.onDisable2FA(code);
      setDisabling(false);
    } catch {
      // The mutation's own onError toasted. Leave the dialog up with the
      // digits in it — a mistyped code is one correction away, not a restart.
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <AccountHeader me={props.me} />
      <PostureCards
        cards={postureCards(props.twoFactor, props.passkeys?.length ?? null)}
        twoFactorLoading={props.twoFactorLoading}
        passkeysLoading={props.passkeysLoading}
      />
      <PasswordSection busy={props.passwordBusy} onSubmit={props.onChangePassword} />
      <TwoFactorSection
        status={props.twoFactor}
        loading={props.twoFactorLoading}
        onDisable={() => setDisabling(true)}
      />
      <PasskeysSection
        passkeys={props.passkeys}
        loading={props.passkeysLoading}
        // The principal, not the 2FA status query: the gateway derives the
        // required factor from the same principal, and the two can disagree
        // for one round trip after a change.
        totpEnabled={props.me.totpEnabled}
        removalBusy={props.removalBusy}
        onRemove={props.onRemovePasskey}
        onAdded={props.onPasskeyAdded}
      />
      <ActivitySection
        entries={props.activity}
        page={props.activityPage}
        pageCount={props.activityPageCount}
        // Nothing to count when the feed never answered — the section draws
        // its callout there and never reaches the footer.
        summary={props.activityTotal === null ? "" : pageSummary(props.activityPage, props.activityTotal)}
        busy={props.activityBusy}
        onPage={props.onPage}
      />
      <DisableTwoFactorModal
        open={disabling}
        busy={props.disableBusy}
        onClose={() => setDisabling(false)}
        onConfirm={(code) => void disable(code)}
      />
    </div>
  );
}
