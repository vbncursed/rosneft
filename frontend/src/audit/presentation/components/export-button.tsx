import { useState } from "react";
import { fetchAuditCsv } from "@/audit/infrastructure/audit-gateway";
import type { AuditFilters } from "@/audit/domain/audit-entry";
import { notify } from "@/shared/application/toast/notify";

export default function ExportButton({ filters }: { filters: AuditFilters }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const url = URL.createObjectURL(await fetchAuditCsv(filters));
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
    >
      {busy ? "Exporting…" : "Export CSV"}
    </button>
  );
}
