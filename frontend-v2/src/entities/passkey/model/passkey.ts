import { supported } from "@github/webauthn-json";

declare global {
  interface Window {
    /** Set by the Tauri shell's initialization script. Absent in a browser. */
    __DESKTOP__?: boolean;
  }
}

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
 * The desktop term is not about capability — the Tauri webview implements
 * WebAuthn perfectly well. Its origin is a loopback port that
 * `PASSKEY_RP_ORIGINS` will never list, so a ceremony started there fails with
 * an opaque client-side error and nothing in any server log. Pre-wiring: the
 * shell embeds `frontend/`, not this SPA, so `__DESKTOP__` is never set today
 * — it is here so the gate is already right on the day it is.
 */
export const isPasskeySupported = (): boolean =>
  typeof window !== "undefined" && !window.__DESKTOP__ && supported();

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
