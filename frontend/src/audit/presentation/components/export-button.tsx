import { useState } from "react";
import { auditCsvPath } from "@/audit/infrastructure/audit-gateway";
import { getToken } from "@/auth/infrastructure/token-store";
import type { AuditFilters } from "@/audit/domain/audit-entry";
import { notify } from "@/shared/application/toast/notify";

const API_BASE = import.meta.env.VITE_API_URL;

// The export needs an Authorization header, which a plain <a download> cannot
// send, so it is fetched and handed to the browser as a blob. The response is
// streamed server-side; only the client end buffers.
export default function ExportButton({ filters }: { filters: AuditFilters }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}${auditCsvPath(filters)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`export failed (${res.status})`);

      const url = URL.createObjectURL(await res.blob());
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
