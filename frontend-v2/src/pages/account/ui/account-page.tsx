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
  passwordBusy: boolean;
  onChangePassword: (current: string, next: string) => void;
};

/** The account screen's content: identity header, posture cards, password form. Draws no chrome. */
export function AccountPage(props: AccountPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <AccountHeader me={props.me} />
      <PostureCards cards={postureCards(props.twoFactor, props.passkeys?.length ?? null)} />
      <PasswordSection busy={props.passwordBusy} onSubmit={props.onChangePassword} />
    </div>
  );
}
