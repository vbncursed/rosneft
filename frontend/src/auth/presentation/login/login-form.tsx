"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const rawNext = useSearchParams().get("next") || "/";
  // Only allow same-origin relative paths — reject schemes and protocol-relative
  // URLs so ?next= can't redirect off-site after login.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/";
  const [step, setStep] = useState<"creds" | "2fa">("creds");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Sign in failed");
      if (data.twoFactorRequired) { setChallenge(data.challengeToken); setStep("2fa"); }
      else router.replace(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setBusy(false); }
  }

  async function submit2FA(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: challenge, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Invalid code");
      router.replace(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid code"); }
    finally { setBusy(false); }
  }

  const inputCls = "mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors duration-200 focus:border-cyan-300/60";
  const label = "block text-xs uppercase tracking-[0.2em] text-neutral-400";

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
        {step === "creds" ? "Sign in" : "Two-factor"}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {step === "creds" ? "Welcome back" : "Enter your code"}
      </h1>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}

      {step === "creds" ? (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submitCreds}>
          <div>
            <label className={label} htmlFor="id">Email or username</label>
            <input id="id" autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={label} htmlFor="pw">Password</label>
            <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </div>
          <button type="submit" disabled={busy || !identifier || !password}
            className="mt-2 cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit2FA}>
          <div>
            <label className={label} htmlFor="code">Authenticator or recovery code</label>
            <input id="code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
              className="mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-[family-name:var(--font-geist-mono)] text-lg tracking-[0.3em] tabular-nums text-white outline-none focus:border-cyan-300/60" />
          </div>
          <button type="submit" disabled={busy || !code}
            className="cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-cyan-200 disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" onClick={() => { setStep("creds"); setCode(""); setError(""); }}
            className="cursor-pointer text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors hover:text-cyan-200">← Back</button>
        </form>
      )}
    </div>
  );
}
