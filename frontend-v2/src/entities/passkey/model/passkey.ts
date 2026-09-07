import { supported } from "@github/webauthn-json";

/** One registered credential, as the account screen lists it. */
export type Passkey = {
  id: string;
  name: string;
  createdAt: string;
  /** Null until the key has actually signed in once. */
  lastUsedAt: string | null;
};

/**
 * The single gate on the whole passkey surface. One check, not two: a second
 * one somewhere else is how the two drift apart.
 */
export const isPasskeySupported = (): boolean => supported();

const dmy = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** "Added 12.08.2026 · last used 07.09.2026" — the mock's row meta line. */
export function passkeyMeta(p: Passkey): string {
  const added = `Added ${dmy(p.createdAt)}`;
  return p.lastUsedAt ? `${added} · last used ${dmy(p.lastUsedAt)}` : added;
}
