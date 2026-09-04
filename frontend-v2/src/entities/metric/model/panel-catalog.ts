export type Unit = "rps" | "cpm" | "percent" | "seconds" | "bytes" | "mbps" | "count";

export type PanelId =
  | "stat-up" | "stat-rps" | "stat-errors" | "stat-p99" | "stat-queue" | "services-up"
  | "red-rate" | "red-errors" | "red-latency" | "red-http"
  | "domain-conversions" | "domain-conversion-p95" | "domain-queue" | "domain-upload" | "domain-auth" | "domain-twofa"
  | "runtime-memory" | "runtime-goroutines" | "runtime-gc" | "runtime-fds"
  | "alerts";

/** Title, subtitle and unit per panel. The PromQL lives only in the gateway's registry. */
export const PANELS: Record<PanelId, { title: string; meta: string; unit: Unit }> = {
  "stat-up": { title: "Up", meta: "services answering", unit: "count" },
  "stat-rps": { title: "Requests", meta: "per second · all HTTP", unit: "rps" },
  "stat-errors": { title: "Errors", meta: "5xx share of HTTP", unit: "percent" },
  "stat-p99": { title: "p99", meta: "gRPC handling", unit: "seconds" },
  "stat-queue": { title: "Queue", meta: "conversion jobs waiting", unit: "count" },
  "services-up": { title: "Services", meta: "1 up · 0 down", unit: "count" },
  "red-rate": { title: "Requests by service", meta: "rps · gRPC", unit: "rps" },
  "red-errors": { title: "Errors by service", meta: "rps · non-OK gRPC", unit: "rps" },
  "red-latency": { title: "Latency p99 by service", meta: "seconds · gRPC", unit: "seconds" },
  "red-http": { title: "HTTP requests", meta: "rps · gateway", unit: "rps" },
  "domain-conversions": { title: "Conversions by status", meta: "per minute", unit: "cpm" },
  "domain-conversion-p95": { title: "Conversion duration p95", meta: "seconds · mesh-worker", unit: "seconds" },
  "domain-queue": { title: "Queue depth", meta: "count · mesh", unit: "count" },
  "domain-upload": { title: "Upload throughput", meta: "MB/s", unit: "mbps" },
  "domain-auth": { title: "Logins by status", meta: "per minute", unit: "cpm" },
  "domain-twofa": { title: "2FA verifications by status", meta: "per minute", unit: "cpm" },
  "runtime-memory": { title: "Resident memory", meta: "bytes · by service", unit: "bytes" },
  "runtime-goroutines": { title: "Goroutines", meta: "count · by service", unit: "count" },
  "runtime-gc": { title: "GC pause (max)", meta: "seconds · by service", unit: "seconds" },
  "runtime-fds": { title: "Open file descriptors", meta: "count · by service", unit: "count" },
  alerts: { title: "Alerts", meta: "firing or pending", unit: "count" },
};

export const STAT_IDS = ["stat-up", "stat-rps", "stat-errors", "stat-p99", "stat-queue"] as const satisfies readonly PanelId[];

export const SECTIONS: { key: string; title: string; panelIds: PanelId[] }[] = [
  { key: "red", title: "Services (RED)", panelIds: ["red-rate", "red-errors", "red-latency", "red-http"] },
  { key: "domain", title: "Domain", panelIds: ["domain-conversions", "domain-conversion-p95", "domain-queue", "domain-upload", "domain-auth", "domain-twofa"] },
  { key: "go", title: "Go runtime", panelIds: ["runtime-memory", "runtime-goroutines", "runtime-gc", "runtime-fds"] },
];

const round = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
// Throughput reads better with one decimal even past single digits — "25
// MB/s" loses exactly the precision a transfer rate is read for.
const round1 = (v: number) => Math.round(v * 10) / 10;

/** "—" for nothing; otherwise the unit's own shape. */
export function formatValue(v: number | null, unit: Unit): string {
  if (v === null || !Number.isFinite(v)) return "—";
  switch (unit) {
    case "rps": return `${round(v)}/s`;
    case "cpm": return `${round(v)}/min`;
    case "percent": return `${round(v * 100)}%`;
    case "seconds": return v < 1 ? `${Math.round(v * 1000)}ms` : `${round(v)}s`;
    case "bytes": return v >= 1024 ** 3 ? `${round(v / 1024 ** 3)} GB` : `${round(v / 1024 ** 2)} MB`;
    case "mbps": return `${round1(v)} MB/s`;
    case "count": return String(round(v));
  }
}
