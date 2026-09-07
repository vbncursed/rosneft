import type { Passkey } from "@/entities/passkey";
import type { TwoFactorStatus } from "@/entities/user";
import type { Principal } from "@/shared/session";
import { postureCards } from "../model/posture";
import { AccountHeader } from "./account-header";
import { PasswordSection } from "./password-section";
import { PostureCards } from "./posture-cards";

export type AccountPageProps = {
  me: Principal;
  twoFactor: TwoFactorStatus | null;
  passkeys: Passkey[] | null;
  /** Still in flight — distinct from "answered null": the card draws a skeleton. */
  twoFactorLoading: boolean;
  passkeysLoading: boolean;
  passwordBusy: boolean;
  /** Resolves only on success — the form clears its fields off this, never unconditionally. */
  onChangePassword: (current: string, next: string) => Promise<void>;
};

/** The account screen's content: identity header, posture cards, password form. Draws no chrome. */
export function AccountPage(props: AccountPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <AccountHeader me={props.me} />
      <PostureCards
        cards={postureCards(props.twoFactor, props.passkeys?.length ?? null)}
        twoFactorLoading={props.twoFactorLoading}
        passkeysLoading={props.passkeysLoading}
      />
      <PasswordSection busy={props.passwordBusy} onSubmit={props.onChangePassword} />
    </div>
  );
}
