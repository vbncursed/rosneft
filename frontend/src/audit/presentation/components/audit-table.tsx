import type { AuditEntry } from "@/audit/domain/audit-entry";
import AuditRow from "@/audit/presentation/components/audit-row";

export default function AuditTable({
  entries,
  actors,
}: {
  entries: AuditEntry[];
  // Опционально: пустой каталог — рабочий режим (у роли нет users:read), тогда
  // строка показывает укороченный UUID, как и раньше.
  actors?: Map<string, string>;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-10 text-center">
        <p className="text-sm text-neutral-400">No entries yet</p>
        <p className="mt-1 text-xs text-neutral-600">
          Changes appear here as soon as someone makes one.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="hidden grid-cols-[11rem_1fr_10rem_5rem] gap-3 border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500 sm:grid">
        <span>When</span>
        <span>What</span>
        <span>Who</span>
        <span className="justify-self-end">Detail</span>
      </div>
      <ul>
        {entries.map((e) => (
          <AuditRow key={e.id} entry={e} actors={actors} />
        ))}
      </ul>
    </div>
  );
}
