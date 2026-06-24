const tone: Record<string, string> = {
  active: "border-emerald-300/40 bg-emerald-500/15 text-emerald-200",
  frozen: "border-amber-300/40 bg-amber-500/15 text-amber-200",
  deleted: "border-white/15 bg-white/5 text-neutral-400",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${tone[status] ?? tone.deleted}`}>
      {status}
    </span>
  );
}
