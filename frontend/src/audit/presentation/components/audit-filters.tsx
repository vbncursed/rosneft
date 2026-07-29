import type { AuditFilters } from "@/audit/domain/audit-entry";
import type { AuditActor } from "@/audit/infrastructure/audit-gateway";
import { actionsFor } from "@/audit/domain/vocabulary";
import {
  actionOptions,
  actorOptions,
  entityOptions,
} from "@/audit/presentation/components/filter-options";
import { todayISO } from "@/shared/domain/calendar";
import Dropdown from "@/shared/presentation/components/dropdown/dropdown";
import DatePicker from "@/shared/presentation/components/date-picker/date-picker";

// Один облик на все пять контролов строки. Три из них Dropdown, два DatePicker,
// и оба компонента принимают его через triggerClassName; иначе дропдаун принёс
// бы собственные bg-white/[0.03] и text-xs, и строка выглядела бы собранной из
// двух разных форм.
//
// focus и focus-within оба нужны: у дропдауна фокус получает сама кнопка, а у
// пикера — текстовое поле внутри обёртки, и одного focus: там не хватило бы.
const FIELD_CLASS =
  "rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white transition-colors hover:border-white/25 focus:border-cyan-400/60 focus-within:border-cyan-400/60 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

export default function AuditFiltersBar({
  value,
  onChange,
  actors,
}: {
  value: AuditFilters;
  onChange: (next: AuditFilters) => void;
  actors: AuditActor[];
}) {
  const set = (key: keyof AuditFilters) => (v: string) => onChange({ ...value, [key]: v });

  // Смена сущности роняет действие, которого в новой сущности нет: пара
  // entity=territory + action=model.update даёт запрос, который всегда пуст, и
  // читается это как «журнал сломался», а не как «фильтры не сходятся».
  const setEntity = (entity: string) => {
    const keep = actionsFor(entity).includes(value.action);
    onChange({ ...value, entity, action: keep ? value.action : "" });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Entity">
        <Dropdown
          ariaLabel="Entity"
          value={value.entity}
          options={entityOptions()}
          onChange={setEntity}
          placeholder="any"
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      {/* Действия зависят от сущности: без неё их сорок, из которых осмысленны
          три. Список — не украшение: триггер пишет ".insert", и набранное по
          аналогии ".create" молча возвращало пустой журнал. */}
      <Field label="Action">
        <Dropdown
          ariaLabel="Action"
          value={value.action}
          options={actionOptions(value.entity)}
          onChange={set("action")}
          placeholder="any"
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      {/* Актор — выбор из списка, а не ввод UUID: набранный руками мусор
          доезжал до SQL и возвращал 500-ю.

          Поле не блокируется на пустом списке: он пуст и первые миллисекунды
          загрузки, так что disabled мигал бы у всех. Пустым он остаётся только
          если журнал пуст или запрос акторов упал; дропдаун с одним "any" в
          этом случае безвреден. */}
      <Field label="Actor">
        <Dropdown
          ariaLabel="Actor"
          value={value.actor}
          options={actorOptions(actors)}
          onChange={set("actor")}
          placeholder="any"
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      <Field label="From">
        <DatePicker
          ariaLabel="From"
          value={value.from}
          onChange={set("from")}
          max={value.to || todayISO()}
          triggerClassName={FIELD_CLASS}
        />
      </Field>
      <Field label="To">
        <DatePicker
          ariaLabel="To"
          value={value.to}
          onChange={set("to")}
          min={value.from}
          max={todayISO()}
          triggerClassName={FIELD_CLASS}
        />
      </Field>
    </div>
  );
}
