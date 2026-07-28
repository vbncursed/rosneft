import { useState } from "react";
import { isSystemChange, type AuditEntry } from "@/audit/domain/audit-entry";
import DiffView from "@/audit/presentation/components/diff-view";
import EntityLink from "@/audit/presentation/components/entity-link";
import { MotionCollapse } from "@/shared/presentation/motion";
import { formatTimestamp } from "@/shared/domain/calendar";

// Session events (login, logout, password change) carry no row snapshots, so
// there is nothing to expand — the action itself is the whole record.
function hasDetail(entry: AuditEntry): boolean {
  return entry.oldRow !== null || entry.newRow !== null;
}

export default function AuditRow({
  entry,
  actors,
}: {
  entry: AuditEntry;
  actors?: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const detail = hasDetail(entry);
  const system = isSystemChange(entry);

  return (
    <li className="border-b border-white/5 last:border-b-0">
      <div className="grid grid-cols-1 items-baseline gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr_10rem_5rem] sm:gap-3">
        <span className="font-mono text-xs text-neutral-500">
          {formatTimestamp(entry.at)}
        </span>

        <span className="min-w-0 text-sm">
          <span className="font-mono text-cyan-200">{entry.action}</span>
          <span className="mx-2 text-neutral-600">·</span>
          <EntityLink entry={entry} />
        </span>

        <span className="truncate text-xs" title={system ? "" : entry.actorId}>
          {system ? (
            <span className="text-neutral-500 italic">system</span>
          ) : (
            // Логин, если он известен; иначе укороченный UUID, как раньше.
            // Полный id остаётся в title — он нужен, когда запись обсуждают.
            <span
              className={
                actors?.has(entry.actorId) ? "text-neutral-300" : "font-mono text-neutral-400"
              }
            >
              {actors?.get(entry.actorId) ?? entry.actorId.slice(0, 8)}
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
          <DiffView oldRow={entry.oldRow} newRow={entry.newRow} />
        </div>
      </MotionCollapse>
    </li>
  );
}
