import { Link } from "@tanstack/react-router";
import type { AuditEntry } from "@/audit/domain/audit-entry";

// Only entities with a stable, slug-addressed page are linkable. A deleted row
// keeps its label in the journal but has nowhere to point, and placements or
// join-table rows have no page at all — those render as plain text rather than
// a link that 404s.
function pathFor(entry: AuditEntry): string | null {
  if (!entry.entityLabel || entry.action.endsWith(".delete")) return null;
  if (entry.entity === "territory") return `/territories/${entry.entityLabel}`;
  if (entry.entity === "model") return `/models/${entry.entityLabel}`;
  return null;
}

export default function EntityLink({ entry }: { entry: AuditEntry }) {
  const label = entry.entityLabel || entry.entityId || "—";
  const to = pathFor(entry);

  if (!to) {
    return <span className="text-neutral-300">{label}</span>;
  }
  return (
    <Link to={to} className="text-cyan-300 underline-offset-2 transition-colors hover:text-cyan-200 hover:underline">
      {label}
    </Link>
  );
}
