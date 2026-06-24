export default function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Save these recovery codes</p>
      <p className="mt-1 text-xs text-neutral-300">Each works once if you lose your authenticator. They won&apos;t be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-[family-name:var(--font-geist-mono)] text-sm text-emerald-100">
        {codes.map((c) => <li key={c} className="rounded bg-black/30 px-2 py-1 text-center tracking-widest">{c}</li>)}
      </ul>
      <button type="button" onClick={onDone} className="mt-4 cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm text-white hover:bg-white/20">I saved them</button>
    </div>
  );
}
