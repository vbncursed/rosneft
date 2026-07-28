import type { Unit } from "./series.ts";
import type { PanelView } from "./panel.ts";

// Client-safe panel catalogue: id → title + unit + page layout. The PromQL
// (`expr`) lives ONLY in the Go registry (gateway internal/metrics) so it never
// enters the browser bundle — the client sends a panel id, the server resolves
// it. Panel ids are the join key and must stay in sync with the Go registry.
const META: Record<string, { title: string; unit: Unit }> = {
  "stat-up": { title: "Services up", unit: "count" },
  "stat-rps": { title: "Requests/sec", unit: "rps" },
  "stat-errors": { title: "Error rate", unit: "percent" },
  "stat-p99": { title: "p99 latency", unit: "seconds" },
  "stat-queue": { title: "Conversion queue", unit: "count" },

  "red-rate": { title: "gRPC requests by service", unit: "rps" },
  "red-errors": { title: "gRPC errors by service", unit: "rps" },
  "red-latency": { title: "gRPC p99 by service", unit: "seconds" },
  "red-http": { title: "HTTP requests", unit: "rps" },

  "domain-conversions": { title: "Conversions by status", unit: "cpm" },
  "domain-conversion-p95": { title: "Conversion duration p95", unit: "seconds" },
  "domain-queue": { title: "Queue depth", unit: "count" },
  "domain-upload": { title: "Upload throughput", unit: "mbps" },
  "domain-auth": { title: "Logins by status", unit: "cpm" },
  "domain-twofa": { title: "2FA checks by status", unit: "cpm" },

  "runtime-memory": { title: "Resident memory", unit: "bytes" },
  "runtime-goroutines": { title: "Goroutines", unit: "count" },
  "runtime-gc": { title: "GC pause (max)", unit: "seconds" },
  "runtime-fds": { title: "Open file descriptors", unit: "count" },
};

// view builds the id/title/unit triple the dashboard renders. Alerts are
// handled by AlertsCard directly and are not part of the stat/section layout.
export function view(id: string): PanelView {
  const m = META[id];
  if (!m) throw new Error(`unknown panel: ${id}`);
  return { id, title: m.title, unit: m.unit };
}

export const STAT_IDS = ["stat-up", "stat-rps", "stat-errors", "stat-p99", "stat-queue"] as const;

export const SECTIONS = [
  { title: "Services (RED)", panelIds: ["red-rate", "red-errors", "red-latency", "red-http"] },
  {
    title: "Domain",
    panelIds: ["domain-conversions", "domain-conversion-p95", "domain-queue", "domain-upload", "domain-auth", "domain-twofa"],
  },
  { title: "Go runtime", panelIds: ["runtime-memory", "runtime-goroutines", "runtime-gc", "runtime-fds"] },
] as const;
