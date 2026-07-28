import type { AuditFilters } from "@/audit/domain/audit-entry";

const FIELD_CLASS =
  "w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-cyan-400/60 focus:outline-none";

// Entities the journal can carry, so the common case is a pick rather than a
// guess at the exact string the trigger writes.
const ENTITIES = [
  "territory",
  "model",
  "placement",
  "panorama",
  "document",
  "user",
  "role",
  "session",
];

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
}: {
  value: AuditFilters;
  onChange: (next: AuditFilters) => void;
}) {
  const set = (key: keyof AuditFilters) => (v: string) => onChange({ ...value, [key]: v });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Action">
        <input
          className={FIELD_CLASS}
          placeholder="territory.update"
          value={value.action}
          onChange={(e) => set("action")(e.target.value)}
        />
      </Field>
      <Field label="Entity">
        <select
          className={FIELD_CLASS}
          value={value.entity}
          onChange={(e) => set("entity")(e.target.value)}
        >
          <option value="">any</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Actor id">
        <input
          className={FIELD_CLASS}
          placeholder="uuid"
          value={value.actor}
          onChange={(e) => set("actor")(e.target.value)}
        />
      </Field>
      {/* Native date inputs: no picker library for two fields. */}
      <Field label="From">
        <input
          type="date"
          className={FIELD_CLASS}
          value={value.from}
          onChange={(e) => set("from")(e.target.value)}
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          className={FIELD_CLASS}
          value={value.to}
          onChange={(e) => set("to")(e.target.value)}
        />
      </Field>
    </div>
  );
}
