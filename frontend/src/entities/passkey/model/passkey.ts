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
 *
 * Inside the desktop shell the origin is the real one, so the RP accepts it;
 * what varies is the OS — Electron reaches Touch ID, Windows Hello or a
 * security key differently on each — and the shell says per platform whether
 * a ceremony works there (window.desktop.passkeys, set in desktop/src/main.ts).
 */
export const isPasskeySupported = (): boolean =>
  typeof window !== "undefined" && (window.desktop?.passkeys ?? true) && supported();

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
