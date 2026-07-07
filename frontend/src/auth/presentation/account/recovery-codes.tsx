import { useState } from "react";
import { notify } from "@/shared/presentation/toast/use-toast";

const actionBtn = "cursor-pointer rounded-full border border-white/20 px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-white hover:bg-white/[0.08]";

export default function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(codes.join("\n")).then(() => {
      notify.success("Codes copied");
      setSaved(true);
    }).catch(() => notify.error("Copy failed — use Download instead"));
  }
  function download() {
    const blob = new Blob([`# Andrey recovery codes — each works once\n${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "andrey-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Save these recovery codes</p>
      <p className="mt-1 text-xs text-neutral-300">Each works once if you lose your authenticator. They won&apos;t be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-[family-name:var(--font-geist-mono)] text-sm text-emerald-100">
        {codes.map((c) => <li key={c} className="rounded bg-black/30 px-2 py-1 text-center tracking-widest">{c}</li>)}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={actionBtn}>Copy</button>
        <button type="button" onClick={download} className={actionBtn}>Download .txt</button>
        <button type="button" onClick={onDone} disabled={!saved} className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40">I saved them</button>
      </div>
    </div>
  );
}
