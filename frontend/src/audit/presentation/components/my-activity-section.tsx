import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import { useAuditLog } from "@/audit/application/use-audit-log";
import { fetchMyAuditPage } from "@/audit/infrastructure/audit-gateway";
import { EMPTY_FILTERS } from "@/audit/domain/audit-entry";
import AuditTable from "@/audit/presentation/components/audit-table";

// Секция «мои действия» на странице аккаунта. Ходит на /api/audit/mine —
// отдельный маршрут, который берёт актора из сессии и не объявляет параметра
// actor вовсе.
//
// Раньше здесь звался общий /api/audit в расчёте на то, что шлюз сузит выборку.
// Для Company Owner, у которого есть и audit:read, он её не сужал — резолвер
// скоупа предпочитает более широкий грант, — и раздел показывал историю всей
// компании под заголовком «My activity».
//
// Фильтров нет намеренно: маршрут отдаёт одного актора, и фильтр по актору
// предлагал бы выбор из одного значения.
//
// Экспорта тоже нет — CSV остаётся за audit:read, это выгрузка истории всей
// компании.
export default function MyActivitySection() {
  const me = useCurrentUser();
  const { entries, refs, isLoading, error, hasMore, loadMore, isLoadingMore } =
    useAuditLog(EMPTY_FILTERS, fetchMyAuditPage, "mine");

  // Гейт — UX, а не граница безопасности: настоящую проверку делает AuditScope
  // на шлюзе. Здесь он только убирает секцию, которая всё равно вернула бы 403.
  if (!can(me, "audit:read_own") && !can(me, "audit:read")) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <header>
        <h2 className="text-sm font-semibold tracking-tight">My activity</h2>
        <p className="mt-1 text-xs text-neutral-400">
          Everything recorded under your account, newest first.
        </p>
      </header>

      <div className="mt-4">
        {error ? (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
            {error instanceof Error ? error.message : "Could not load your activity"}
          </p>
        ) : isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing recorded yet.</p>
        ) : (
          <AuditTable entries={entries} refs={refs} />
        )}
      </div>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="rounded-md border border-white/10 px-4 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {isLoadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
