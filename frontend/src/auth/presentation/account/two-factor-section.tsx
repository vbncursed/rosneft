"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { setup2FA, enable2FA, disable2FA, regenerateRecoveryCodes } from "@/auth/infrastructure/auth-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";
import RecoveryCodes from "@/auth/presentation/account/recovery-codes";

type Mode = "idle" | "setup" | "codes" | "disable" | "regen";

export default function TwoFactorSection({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [mode, setMode] = useState<Mode>("idle");
  const [otpauth, setOtpauth] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const cardCls = "flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur";
  const codeInput = "rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center font-[family-name:var(--font-geist-mono)] text-lg tracking-[0.3em] tabular-nums text-white outline-none focus:border-cyan-300/60";

  async function begin() {
    setBusy(true);
    try {
      const r = await setup2FA();
      setSecret(r.secret);
      setOtpauth(r.otpauthUrl);
      setMode("setup");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    try {
      setCodes(await enable2FA(code));
      setEnabled(true);
      setCode("");
      setMode("codes");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }
  async function turnOff() {
    setBusy(true);
    try {
      await disable2FA(code);
      setEnabled(false);
      setCode("");
      setMode("idle");
      notify.success("2FA disabled");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }
  async function regenerate() {
    setBusy(true);
    try {
      setCodes(await regenerateRecoveryCodes(code));
      setCode("");
      setMode("codes");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "codes") {
    return (
      <div className={cardCls}>
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Two-factor</p>
        <RecoveryCodes codes={codes} onDone={() => setMode("idle")} />
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Two-factor</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${enabled ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200" : "border-white/15 text-neutral-400"}`}>{enabled ? "On" : "Off"}</span>
      </div>

      {mode === "idle" && !enabled ? (
        <button type="button" disabled={busy} onClick={begin} className="cursor-pointer self-start rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30">{busy ? "…" : "Enable 2FA"}</button>
      ) : null}

      {mode === "idle" && enabled ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("regen")} className="cursor-pointer rounded-full border border-white/20 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white hover:bg-white/[0.08]">Regenerate recovery codes</button>
          <button type="button" onClick={() => setMode("disable")} className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-6 py-3 text-xs uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20">Disable 2FA</button>
        </div>
      ) : null}

      {mode === "regen" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">Enter a current code to replace your recovery codes. Existing codes stop working.</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="000000" className={codeInput} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !code} onClick={regenerate} className="cursor-pointer rounded-full bg-white px-6 py-2 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30">{busy ? "…" : "Regenerate"}</button>
            <button type="button" onClick={() => { setMode("idle"); setCode(""); }} className="cursor-pointer rounded-full border border-white/20 px-6 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-white/[0.08]">Cancel</button>
          </div>
        </div>
      ) : null}

      {mode === "setup" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">Scan with your authenticator, then enter the 6-digit code.</p>
          <div className="self-start rounded-xl bg-[#0c0d10] p-3"><QRCodeSVG value={otpauth} size={160} bgColor="#0c0d10" fgColor="#e5e7eb" /></div>
          <p className="break-all text-[11px] text-neutral-500">Manual key: <span className="font-[family-name:var(--font-geist-mono)] text-neutral-300">{secret}</span></p>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="000000" className={codeInput} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !code} onClick={confirm} className="cursor-pointer rounded-full bg-white px-6 py-2 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200 disabled:bg-white/30">{busy ? "…" : "Confirm"}</button>
            <button type="button" onClick={() => setMode("idle")} className="cursor-pointer rounded-full border border-white/20 px-6 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-white/[0.08]">Cancel</button>
          </div>
        </div>
      ) : null}

      {mode === "disable" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">Enter a current code to disable 2FA.</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="000000" className={codeInput} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !code} onClick={turnOff} className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-6 py-2 text-xs uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20 disabled:opacity-50">{busy ? "…" : "Disable"}</button>
            <button type="button" onClick={() => setMode("idle")} className="cursor-pointer rounded-full border border-white/20 px-6 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-white/[0.08]">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
