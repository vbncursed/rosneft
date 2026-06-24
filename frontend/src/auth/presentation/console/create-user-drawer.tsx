"use client";

import { useState } from "react";
import Field from "@/upload/presentation/components/field";
import PasswordField from "@/shared/presentation/components/password-field";
import type { Role } from "@/auth/domain/role";
import { createUser } from "@/auth/infrastructure/auth-admin-gateway";
import { validateUsername, validateEmail, validatePassword, generatePassword } from "@/auth/domain/credential-rules";
import { notify } from "@/shared/presentation/toast/use-toast";

export default function CreateUserDrawer({ roles, onClose, onCreated }: { roles: Role[]; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const emailErr = validateEmail(email);
  const usernameErr = validateUsername(username);
  const passwordErr = validatePassword(password);
  const invalid = !!(emailErr || usernameErr || passwordErr);

  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createUser(email, username, password, picked);
      notify.success("User created");
      onCreated();
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">New user</p>
        <Field label="Email" value={email} onChange={setEmail} required error={email ? emailErr : null} />
        <Field label="Username" value={username} onChange={setUsername} required error={username ? usernameErr : null} />
        <PasswordField label="Password" value={password} onChange={setPassword} required autoComplete="new-password"
          error={password ? passwordErr : null} onGenerate={() => setPassword(generatePassword())} />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Roles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map((r) => (
              <button key={r.slug} type="button" onClick={() => toggle(r.slug)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${picked.includes(r.slug) ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/15 text-neutral-300 hover:bg-white/10"}`}>
                {r.slug}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06]">Cancel</button>
          <button type="submit" disabled={busy || invalid}
            className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
