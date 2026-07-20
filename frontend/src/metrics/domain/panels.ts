import type { PanelDef } from "./panel.ts";

export const PANELS: readonly PanelDef[] = [
  // — Плитки: мгновенный снимок.
  { id: "stat-up", title: "Services up", unit: "count", kind: "stat", instant: true,
    expr: 'sum(up{job="services"})' },
  // `or vector(0)`: sum() по нулю серий даёт пустой вектор, а не ноль. Без этого
  // плитка вечно показывает «…» вместо правдивого нуля, когда 5xx (или трафика)
  // просто не было.
  { id: "stat-rps", title: "Requests/sec", unit: "rps", kind: "stat", instant: true,
    expr: "sum(rate(http_requests_total[5m])) or vector(0)" },
  { id: "stat-errors", title: "Error rate", unit: "percent", kind: "stat", instant: true,
    expr: '(sum(rate(http_requests_total{code=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(http_requests_total[5m])),0.001)' },
  { id: "stat-p99", title: "p99 latency", unit: "seconds", kind: "stat", instant: true,
    expr: "histogram_quantile(0.99, sum by (le)(rate(grpc_server_handling_seconds_bucket[5m])))" },
  { id: "stat-queue", title: "Conversion queue", unit: "count", kind: "stat", instant: true,
    expr: "max(mesh_queue_depth)" },

  // — Services (RED).
  { id: "red-rate", title: "gRPC requests by service", unit: "rps", kind: "line",
    expr: "sum by (service)(rate(grpc_server_handled_total[5m]))" },
  { id: "red-errors", title: "gRPC errors by service", unit: "rps", kind: "line",
    expr: 'sum by (service)(rate(grpc_server_handled_total{grpc_code!="OK"}[5m]))' },
  { id: "red-latency", title: "gRPC p99 by service", unit: "seconds", kind: "line",
    expr: "histogram_quantile(0.99, sum by (le, grpc_service)(rate(grpc_server_handling_seconds_bucket[5m])))" },
  { id: "red-http", title: "HTTP requests", unit: "rps", kind: "line",
    expr: "sum(rate(http_requests_total[5m]))" },

  // — Domain.
  { id: "domain-conversions", title: "Conversions by status", unit: "cpm", kind: "line",
    expr: "sum by (status)(rate(mesh_conversions_total[5m])) * 60" },
  { id: "domain-conversion-p95", title: "Conversion duration p95", unit: "seconds", kind: "line",
    expr: "histogram_quantile(0.95, sum by (le)(rate(mesh_conversion_duration_seconds_bucket[10m])))" },
  { id: "domain-queue", title: "Queue depth", unit: "count", kind: "line",
    expr: "mesh_queue_depth" },
  { id: "domain-upload", title: "Upload throughput", unit: "mbps", kind: "line",
    expr: "sum(rate(upload_bytes_total[5m])) / 1048576" },
  { id: "domain-auth", title: "Logins by status", unit: "cpm", kind: "line",
    expr: "sum by (status)(rate(auth_logins_total[5m])) * 60" },
  { id: "domain-twofa", title: "2FA checks by status", unit: "cpm", kind: "line",
    expr: "sum by (status)(rate(twofa_verifications_total[5m])) * 60" },

  // — Go runtime.
  { id: "runtime-memory", title: "Resident memory", unit: "bytes", kind: "line",
    expr: "process_resident_memory_bytes" },
  { id: "runtime-goroutines", title: "Goroutines", unit: "count", kind: "line",
    expr: "go_goroutines" },
  // quantile у go_gc_duration_seconds экспортируется как "1.0", не "1" —
  // со старым селектором панель не совпадала ни с чем и всегда была пустой.
  { id: "runtime-gc", title: "GC pause (max)", unit: "seconds", kind: "line",
    expr: 'max by (service)(go_gc_duration_seconds{quantile="1.0"})' },
  { id: "runtime-fds", title: "Open file descriptors", unit: "count", kind: "line",
    expr: "process_open_fds" },

  // — Алерты: ALERTS существует, только пока правило активно.
  { id: "alerts", title: "Alerts", unit: "count", kind: "alerts", instant: true,
    expr: 'ALERTS{alertstate=~"firing|pending"}' },
] as const;

export function findPanel(id: string): PanelDef | undefined {
  return PANELS.find((p) => p.id === id);
}

/** Порядок секций на странице. Плитки и алерты рендерятся отдельно. */
export const SECTIONS = [
  { title: "Services (RED)", panelIds: ["red-rate", "red-errors", "red-latency", "red-http"] },
  { title: "Domain", panelIds: ["domain-conversions", "domain-conversion-p95", "domain-queue",
      "domain-upload", "domain-auth", "domain-twofa"] },
  { title: "Go runtime", panelIds: ["runtime-memory", "runtime-goroutines", "runtime-gc", "runtime-fds"] },
] as const;

export const STAT_IDS = ["stat-up", "stat-rps", "stat-errors", "stat-p99", "stat-queue"] as const;
