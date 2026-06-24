"use client";

import { useState } from "react";
import PasswordField from "@/shared/presentation/components/password-field";
import { changePassword } from "@/auth/infrastructure/auth-gateway";
import { validatePassword, generatePassword } from "@/auth/domain/credential-rules";
import { notify } from "@/shared/presentation/toast/use-toast";

export default function ChangePasswordForm() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const newErr = validatePassword(newPw);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await changePassword(oldPw, newPw);
      notify.success("Password changed");
      setOldPw("");
      setNewPw("");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Change failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Password</p>
      <PasswordField label="Current password" value={oldPw} onChange={setOldPw} required autoComplete="current-password" />
      <PasswordField label="New password" value={newPw} onChange={setNewPw} required autoComplete="new-password"
        error={newPw ? newErr : null} onGenerate={() => setNewPw(generatePassword())} />
      <button type="submit" disabled={busy || !oldPw || !!newErr} className="cursor-pointer self-start rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30 disabled:text-white/50">{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
