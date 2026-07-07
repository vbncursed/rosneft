"use client";

import { useEffect, useState } from "react";
import { listPasskeys, beginRegistration, finishRegistration, deletePasskey, type Passkey } from "@/auth/infrastructure/passkey-gateway";
import { createCredential, isPasskeySupported } from "@/auth/infrastructure/webauthn";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { confirmWithInput } from "@/shared/presentation/confirm/use-confirm";
import { notify } from "@/shared/presentation/toast/use-toast";

const cardCls = "flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur";

// fmtDate renders an RFC3339 timestamp as dd.mm.yyyy, or "" if unparseable.
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export default function PasskeysSection() {
  const me = useCurrentUser();
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isPasskeySupported());
    listPasskeys().then(setKeys).catch(() => {});
  }, []);

  async function add() {
    // Name first, then run the ceremony — avoids leaving an unregistered
    // credential on the authenticator if the user backs out of naming.
    const name = await confirmWithInput({
      title: "Add a passkey",
      message: "Name this passkey so you can recognise it later.",
      field: { type: "text", placeholder: "My device" },
      confirmLabel: "Continue",
    });
    if (name === null) return;
    setBusy(true);
    try {
      const { optionsJson, flowId } = await beginRegistration();
      const credentialJson = await createCredential(optionsJson);
      const created = await finishRegistration(flowId, credentialJson, name);
      setKeys((k) => [created, ...k]);
      notify.success("Passkey added");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not add passkey");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const totp = me?.totpEnabled ?? false;
    const value = await confirmWithInput({
      title: "Remove passkey",
      message: totp
        ? "Enter your authenticator code to confirm removal."
        : "Enter your account password to confirm removal.",
      field: totp
        ? { type: "code", altLabel: "Use a recovery code instead", altPlaceholder: "xxxxx-xxxxx" }
        : { type: "password" },
      danger: true,
      confirmLabel: "Remove",
    });
    if (value === null) return;
    try {
      await deletePasskey(id, totp ? { code: value } : { password: value });
      setKeys((k) => k.filter((x) => x.id !== id));
      notify.success("Passkey removed");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not remove passkey");
    }
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Passkeys</p>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-400">{keys.length}</span>
      </div>
      {!supported ? (
        <p className="text-sm text-neutral-400">This browser doesn&apos;t support passkeys.</p>
      ) : (
        <>
          {keys.length ? (
            <ul className="flex flex-col gap-2">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{k.name}</p>
                    <p className="text-[11px] text-neutral-500">Added {fmtDate(k.createdAt)}{k.lastUsedAt ? ` · last used ${fmtDate(k.lastUsedAt)}` : ""}</p>
                  </div>
                  <button type="button" onClick={() => remove(k.id)} className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/20">Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-400">No passkeys yet. Add one for one-tap sign-in.</p>
          )}
          <button type="button" disabled={busy} onClick={add} className="cursor-pointer self-start rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30">{busy ? "…" : "Add passkey"}</button>
        </>
      )}
    </div>
  );
}
