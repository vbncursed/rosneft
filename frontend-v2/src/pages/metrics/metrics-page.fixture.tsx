import { useMemo, useState } from "react";
import type { ServiceHealth } from "@/entities/metric";
import { parseFilters } from "@/features/audit-filter";
import { ConsoleLayout } from "@/widgets/console-layout";
import type { FiringAlert } from "@/widgets/alert-inspector";
import type { MetricSection } from "@/widgets/metric-panels";
import { MetricsPage } from "./ui/metrics-page";
import type { MetricsRange } from "./model/range";

const noop = () => {};

const wave = (n: number, base: number, amp: number, seed: number, drift = 0) =>
  Array.from({ length: n }, (_, i) =>
    Math.max(0, base + Math.sin((i + seed) * 0.7) * amp + Math.sin((i + seed) * 0.23) * amp * 0.6 + (i / n) * drift),
  );

const SERVICES: ServiceHealth[] = [
  { name: "gateway", state: "degraded", meta: "5xx 0.82% · 142 rps · 3 replicas", latency: "18ms", errors: "1.2/s", samples: wave(18, 120, 24, 1, 20) },
  { name: "auth-service", state: "up", meta: "logins 12/min · 2FA 8/min", latency: "24ms", errors: "0.1/s", samples: wave(18, 40, 8, 5) },
  { name: "mesh-worker", state: "degraded", meta: "2 jobs running · queue 3", latency: "1.4s", errors: "0.3/s", samples: wave(18, 18, 6, 9, 4) },
  { name: "audit-service", state: "down", meta: "scrape failed · last seen 2h ago", latency: "—", errors: "—", samples: wave(18, 4, 3, 2, -3) },
  { name: "object-storage", state: "up", meta: "24.6 MB/s upload · 184 GB used", latency: "31ms", errors: "0/s", samples: wave(18, 60, 14, 7) },
];

const SECTIONS: MetricSection[] = [
  {
    key: "traffic",
    title: "Traffic & latency",
    panels: [
      { key: "latency", title: "Request latency", meta: "p50 / p95 / p99 · ms", last: "452ms", lastTone: "accent", unit: "ms",
        series: [
          { label: "p50", values: wave(24, 92, 10, 2), tone: "muted", dashed: true },
          { label: "p95", values: wave(24, 250, 50, 3) },
          { label: "p99", values: wave(24, 460, 90, 4, -40), tone: "bad" },
        ] },
      { key: "protocol", title: "Requests by protocol", meta: "rps · http vs grpc", last: "142/s",
        series: [
          { label: "http", values: wave(24, 96, 18, 1, 14) },
          { label: "grpc", values: wave(24, 46, 10, 6), tone: "ok" },
        ] },
      { key: "errors", title: "Errors by service", meta: "rps · 5xx", last: "1.6/s", lastTone: "bad",
        series: [
          { label: "gateway", values: wave(24, 0.9, 0.4, 3, 0.5), tone: "bad" },
          { label: "mesh", values: wave(24, 0.3, 0.2, 8), tone: "warn" },
        ] },
      { key: "sessions", title: "Active sessions", meta: "count · viewer", last: "37",
        series: [{ label: "sessions", values: wave(24, 32, 6, 5, 6) }] },
    ],
  },
  {
    key: "domain",
    title: "Domain",
    panels: [
      { key: "conversions", title: "Conversions by status", meta: "cpm · done vs failed", last: "6/min",
        series: [
          { label: "done", values: wave(24, 5, 2, 1), tone: "ok" },
          { label: "failed", values: wave(24, 0.7, 0.5, 8), tone: "bad" },
        ] },
      { key: "duration", title: "Conversion duration p95", meta: "seconds · mesh-worker", last: "184s", lastTone: "accent",
        series: [{ label: "p95", values: wave(24, 180, 42, 3, 24) }] },
      { key: "queue", title: "Queue depth", meta: "count · mesh-worker", last: "3", lastTone: "warn",
        series: [{ label: "depth", values: wave(24, 2.4, 1.4, 5, 1.2), tone: "warn" }] },
      { key: "logins", title: "Logins by status", meta: "cpm · ok vs denied", last: "12/min",
        series: [
          { label: "ok", values: wave(24, 11, 4, 4), tone: "ok" },
          { label: "denied", values: wave(24, 1.4, 1, 9), tone: "bad" },
        ] },
    ],
  },
  {
    key: "go",
    title: "Go runtime",
    panels: [
      { key: "memory", title: "Resident memory", meta: "bytes · by service", last: "1.4 GB",
        series: [
          { label: "gateway", values: wave(24, 1.35, 0.12, 1, 0.1) },
          { label: "mesh", values: wave(24, 0.82, 0.2, 7), tone: "muted" },
        ] },
      { key: "goroutines", title: "Goroutines", meta: "count · gateway", last: "412",
        series: [{ label: "goroutines", values: wave(24, 390, 40, 3, 30) }] },
      { key: "gc", title: "GC pause (max)", meta: "seconds · gateway", last: "8ms", lastTone: "accent",
        series: [{ label: "pause", values: wave(24, 0.008, 0.003, 5) }] },
      { key: "fds", title: "Open file descriptors", meta: "count · by service", last: "268",
        series: [{ label: "fds", values: wave(24, 250, 30, 2, 24) }] },
    ],
  },
];

const ALERT: FiringAlert = {
  name: "HighErrorRate",
  meta: "gateway · severity: critical",
  firingFor: "14m",
  series: { label: "5xx", values: wave(24, 0.4, 0.16, 3, 0.55), tone: "bad" },
  threshold: { share: 45, label: "0.5%" },
  details: [
    { label: "expr", value: "rate(http_5xx[5m]) > 0.005" },
    { label: "for", value: "10m" },
    { label: "value", value: "0.82%", tone: "bad" },
    { label: "since", value: "2026-09-02 06:38 UTC" },
  ],
  contributors: [
    { path: "GET /api/territories/:slug", value: "412", share: 100 },
    { path: "POST /api/models/upload", value: "188", share: 46, tone: "warn" },
    { path: "GET /api/placements", value: "64", share: 16, tone: "accent" },
  ],
};

const NAV = [
  { key: "users", label: "Users", href: "#" },
  { key: "roles", label: "Roles & Permissions", href: "#" },
  { key: "content", label: "Content", href: "#" },
  { key: "access", label: "Territory access", href: "#" },
  { key: "audit", label: "Audit journal", href: "#" },
  { key: "metrics", label: "Metrics", href: "#" },
];

function Live({ withAlert }: { withAlert: boolean }) {
  const [range, setRange] = useState<MetricsRange>("6h");
  const [query, setQuery] = useState("service:gateway");
  const [service, setService] = useState<string | null>("gateway");
  const [panel, setPanel] = useState<string | null>("latency");
  const [alert, setAlert] = useState<FiringAlert | null>(withAlert ? ALERT : null);

  const services = useMemo(() => {
    const filters = parseFilters(query);
    return SERVICES.filter((s) =>
      filters.every((f) => (f.key === "service" ? s.name.includes(f.value) : true)),
    );
  }, [query]);

  return (
    <ConsoleLayout
      items={NAV}
      active="metrics"
      backHref="#"
      viewer={{ username: "a.ivanova", roleTitle: "Company Owner" }}
    >
      <MetricsPage
        services={services}
        sections={SECTIONS}
        budget={{
          label: "SLO budget · 30d",
          detail: "64% left",
          detailTone: "warn",
          segments: [
            { tone: "warn", value: 36, label: "consumed" },
            { tone: "ok", value: 60, label: "remaining" },
            { tone: "bad", value: 4, label: "burning now" },
          ],
        }}
        stats={[
          { label: "Requests/sec", value: "142/s", hint: "gateway · http + grpc", delta: "+8%", deltaTone: "ok" },
          { label: "Error rate", value: "0.82%", hint: "SLO 0.5% breached", tone: "bad", delta: "+0.3", deltaTone: "bad" },
          { label: "p99 latency", value: "452ms", hint: "SLO 600ms", tone: "accent", delta: "−12%", deltaTone: "ok" },
        ]}
        range={range}
        onRangeChange={setRange}
        query={query}
        onQueryChange={setQuery}
        selectedService={service}
        onSelectService={setService}
        selectedPanel={panel}
        onSelectPanel={setPanel}
        firingCount={alert ? 2 : 0}
        alert={alert}
        onCloseAlert={() => setAlert(null)}
        onSilence={noop}
        onOpenInAudit={noop}
        onCopyPromQl={noop}
      />
    </ConsoleLayout>
  );
}

export default {
  firing: <Live withAlert />,
  quiet: <Live withAlert={false} />,
};
