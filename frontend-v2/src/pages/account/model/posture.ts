import type { TwoFactorStatus } from "@/entities/user";

export type PostureTone = "ok" | "neutral" | "dim";
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
 */
export function postureCards(twoFactor: TwoFactorStatus | null, passkeys: number | null): PostureCard[] {
  return [
    {
      label: "Two-factor",
      value: twoFactor === null ? "—" : twoFactor.enabled ? "TOTP" : "Off",
      badge: twoFactor === null ? "unknown" : twoFactor.enabled ? "on" : "off",
      tone: twoFactor?.enabled ? "ok" : "dim",
      hint: "A code from your authenticator at every sign-in.",
    },
    {
      label: "Passkeys",
      value: passkeys === null ? "—" : String(passkeys),
      badge: passkeys === null ? "unknown" : passkeys > 0 ? "ok" : "none",
      tone: passkeys !== null && passkeys > 0 ? "ok" : "dim",
      hint: "One-tap sign-in on registered devices.",
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
