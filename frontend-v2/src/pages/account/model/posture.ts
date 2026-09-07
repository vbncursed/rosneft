import type { TwoFactorStatus } from "@/entities/user";

/**
 * `ok` is the tinted green fill; `neutral` the outlined chrome — `text-muted`
 * over the card's own ground, 6.82:1 dark / 5.69:1 light. `dim` is deliberately
 * not offered: at this badge's 9px it measures 3.35:1 dark / 3.09:1 light on
 * `panel-2`, under the 4.5:1 floor, and off/unknown is exactly the state a
 * reader must be able to read.
 */
export type PostureTone = "ok" | "neutral";
export type PostureCard = {
  label: string;
  value: string;
  badge: string;
  tone: PostureTone;
  hint: string;
};

/**
 * The three cards across the top of the account screen. Both inputs are
 * nullable and null means "we could not find out" — never "no": a status query
 * that failed must not be rendered as a factor being off.
 *
 * The hint answers the same three states as the value and the badge. It used
 * to be one fixed sentence per card, printed unchanged under "Off" and under
 * "—", so two of every three readings said something untrue.
 */
export function postureCards(twoFactor: TwoFactorStatus | null, passkeys: number | null): PostureCard[] {
  return [
    {
      label: "Two-factor",
      value: twoFactor === null ? "—" : twoFactor.enabled ? "TOTP" : "Off",
      badge: twoFactor === null ? "unknown" : twoFactor.enabled ? "on" : "off",
      tone: twoFactor?.enabled ? "ok" : "neutral",
      hint:
        twoFactor === null
          ? "We could not read the two-factor status just now."
          : twoFactor.enabled
            ? "Every sign-in asks for a code from your authenticator app."
            : "Your password alone signs you in — no second factor is asked for.",
    },
    {
      label: "Passkeys",
      value: passkeys === null ? "—" : String(passkeys),
      badge: passkeys === null ? "unknown" : passkeys > 0 ? "ok" : "none",
      tone: passkeys !== null && passkeys > 0 ? "ok" : "neutral",
      hint:
        passkeys === null
          ? "We could not read your registered passkeys just now."
          : passkeys > 0
            ? "These devices sign you in with the unlock they already use."
            : "No device is registered, so nothing signs you in without your password.",
    },
    {
      label: "Password",
      value: "Set",
      badge: "fallback",
      tone: "neutral",
      hint: "Still accepted as a fallback factor.",
    },
  ];
}
