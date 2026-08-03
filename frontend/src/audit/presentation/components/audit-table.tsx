import type { AuditEntry } from "@/audit/domain/audit-entry";
import AuditRow from "@/audit/presentation/components/audit-row";
import type { Refs } from "@/audit/domain/ref-label";

export default function AuditTable({
  entries,
  refs = {},
}: {
  entries: AuditEntry[];
  refs?: Refs;
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
    // @container, а не медиазапрос: одна и та же таблица живёт в двух
    // контейнерах разной ширины, и брейкпоинт смотрит на окно, а не на них.
    // На широком мониторе узкий /account получал сетку, рассчитанную на
    // консоль: колонке «What» доставалось ~162px под строки вида
    // "document.delete · test · dji-wp-46-cut", и они наползали на «Who».
    //
    // Пороги выбраны по измеренным ширинам, а не на глаз:
    //   /account     48rem (max-w-3xl) − 5 (px-10) − 2.5 (p-5)      = 40.4rem
    //   /admin/audit 72rem (max-w-6xl) − 5 − 12.5 (сайдбар) − 2 (gap) = 52.5rem
    // Отсюда @xl (36rem) для узкого набора и @3xl (48rem) для широкого:
    // /account берёт первый, консоль — второй и выглядит как прежде. Пороги
    // выше (@2xl=42rem, @4xl=56rem) промахнулись бы мимо обеих страниц.
    <div className="@container overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="hidden gap-3 border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500 @xl:grid @xl:grid-cols-[9rem_1fr_7rem_4rem] @3xl:grid-cols-[11rem_1fr_10rem_5rem]">
        <span>When</span>
        <span>What</span>
        <span>Who</span>
        <span className="justify-self-end">Detail</span>
      </div>
      <ul>
        {entries.map((e) => (
          <AuditRow key={e.id} entry={e} refs={refs} />
        ))}
      </ul>
    </div>
  );
}
