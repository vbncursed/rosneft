import { useState } from "react";
import PasswordField from "@/shared/presentation/components/password-field";
import OtpInput from "@/shared/presentation/components/otp-input";
import { login, verifyTwoFactor } from "@/auth/infrastructure/auth-login";
import { loginBegin, loginFinish } from "@/auth/infrastructure/passkey-gateway";
import { getAssertion, isPasskeyCancelled } from "@/auth/infrastructure/webauthn";

// Passkey/WebAuthn is origin-bound to the web domain; in the desktop app the
// origin is 127.0.0.1 (not a valid RP), so the flow 500s — hide it there.
// ponytail: probed once at module scope, neither value changes at runtime.
const canPasskey =
  !navigator.userAgent.includes("Electron") && typeof window.PublicKeyCredential === "function";

export default function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<"creds" | "2fa">("creds");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await login(identifier, password);
      if (r.twoFactorRequired) { setChallenge(r.challengeToken); setStep("2fa"); }
      else window.location.assign(next); // hard nav → fresh SPA state with token
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setBusy(false); }
  }

  async function signInWithPasskey() {
    setBusy(true); setError("");
    try {
      const { optionsJson, flowId } = await loginBegin();
      await loginFinish(flowId, await getAssertion(optionsJson));
      window.location.assign(next);
    } catch (e) {
      // Dismissing the prompt leaves the form exactly as it was — surfacing the
      // browser's NotAllowedError text would read as a failure the user caused.
      if (!isPasskeyCancelled(e)) {
        setError(e instanceof Error ? e.message : "Passkey sign-in failed");
      }
    } finally { setBusy(false); }
  }

  async function verify(codeVal: string) {
    if (busy || !codeVal) return;
    setBusy(true); setError("");
    try {
      await verifyTwoFactor(challenge, codeVal);
      window.location.assign(next);
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
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <button type="submit" disabled={busy || !identifier || !password}
            className="mt-2 cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors duration-200 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {canPasskey ? (
            <>
              <div className="flex items-center gap-4 text-[0.65rem] uppercase tracking-[0.2em] text-neutral-500">
                <span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" />
              </div>
              <button type="button" onClick={signInWithPasskey} disabled={busy}
                className="cursor-pointer rounded-full border border-white/20 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? "…" : "Sign in with passkey"}
              </button>
            </>
          ) : null}
        </form>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify(code); }}>
          {recovery ? (
            <div>
              <label className={label} htmlFor="code">Recovery code</label>
              <input id="code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxxx-xxxxx"
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-mono text-lg tracking-[0.2em] text-white outline-none focus:border-cyan-300/60" />
            </div>
          ) : (
            <div>
              <p className={label}>Authenticator code</p>
              <div className="mt-2"><OtpInput value={code} onChange={setCode} onComplete={verify} autoFocus /></div>
            </div>
          )}
          <button type="submit" disabled={busy || (recovery ? !code : code.length !== 6)}
            className="cursor-pointer rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-cyan-200 disabled:bg-white/30 disabled:text-white/50">
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" onClick={() => { setRecovery(!recovery); setCode(""); setError(""); }}
            className="cursor-pointer text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors hover:text-cyan-200">
            {recovery ? "Use authenticator code instead" : "Use a recovery code instead"}
          </button>
          <button type="button" onClick={() => { setStep("creds"); setCode(""); setError(""); setRecovery(false); }}
            className="cursor-pointer text-xs uppercase tracking-[0.2em] text-neutral-400 transition-colors hover:text-cyan-200">← Back</button>
        </form>
      )}
    </div>
  );
}
