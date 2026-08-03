import { useState } from "react";
import { isSystemChange, type AuditEntry } from "@/audit/domain/audit-entry";
import DiffView from "@/audit/presentation/components/diff-view";
import type { Refs } from "@/audit/domain/ref-label";
import EntityLink from "@/audit/presentation/components/entity-link";
import { MotionCollapse } from "@/shared/presentation/motion";
import { formatTimestamp } from "@/shared/domain/calendar";

// Session events (login, logout, password change) carry no row snapshots, so
// there is nothing to expand — the action itself is the whole record.
function hasDetail(entry: AuditEntry): boolean {
  return entry.oldRow !== null || entry.newRow !== null;
}

export default function AuditRow({ entry, refs = {} }: { entry: AuditEntry; refs?: Refs }) {
  const [open, setOpen] = useState(false);
  const detail = hasDetail(entry);
  const system = isSystemChange(entry);

  return (
    <li className="border-b border-white/5 last:border-b-0">
      {/* Шаблон колонок обязан совпадать с шапкой в audit-table.tsx символ в
          символ: это две независимые сетки, выглядящие одной таблицей ровно
          пока совпадают, и разъехавшись они не сломают ни сборку, ни тест —
          только заголовки перестанут стоять над своими колонками. */}
      <div className="grid grid-cols-1 items-baseline gap-1 px-4 py-3 @xl:grid-cols-[9rem_1fr_7rem_4rem] @xl:gap-3 @3xl:grid-cols-[11rem_1fr_10rem_5rem]">
        <span className="font-mono text-xs text-neutral-500">
          {formatTimestamp(entry.at)}
        </span>

        <span className="min-w-0 text-sm">
          <span className="font-mono text-cyan-200">{entry.action}</span>
          <span className="mx-2 text-neutral-600">·</span>
          <EntityLink entry={entry} />
          {/* Территория дописывается в ту же ячейку, а не отдельной колонкой:
              сетка строки и так схлопывается в одну колонку ниже sm. Без
              родителя запись вида "placement.update · 71" не сообщает ничего:
              метка у размещения необязательна и чаще всего пуста, так что
              EntityLink остаётся с голым id. */}
          {entry.territorySlug ? (
            <>
              <span className="mx-2 text-neutral-600">·</span>
              <span className="text-neutral-400">{entry.territorySlug}</span>
            </>
          ) : null}
        </span>

        <span className="truncate text-xs" title={system ? "" : entry.actorId}>
          {system ? (
            <span className="text-neutral-500 italic">system</span>
          ) : (
            // Логин, если сервер его разрешил; иначе укороченный UUID. Пустая
            // подпись означает «пользователь удалён или auth был недоступен»,
            // а не «у тебя нет прав» — прав на это теперь не требуется.
            <span
              className={entry.actorLogin ? "text-neutral-300" : "font-mono text-neutral-400"}
            >
              {entry.actorLogin || entry.actorId.slice(0, 8)}
            </span>
          )}
        </span>

        <span className="flex items-center gap-2 justify-self-start sm:justify-self-end">
          {entry.result === "failed" ? (
            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-rose-300">
              failed
            </span>
          ) : null}
          {detail ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              {open ? "hide" : "diff"}
            </button>
          ) : null}
        </span>
      </div>

      <MotionCollapse open={open && detail} className="border-t border-white/5 bg-black/20">
        {/* Отступы на внутреннем элементе: padding на анимируемом остался бы
            виден при height:0 и оставил бы полосу под закрытой строкой. */}
        <div className="px-4 py-3">
          <DiffView oldRow={entry.oldRow} newRow={entry.newRow} refs={refs} />
        </div>
      </MotionCollapse>
    </li>
  );
}
