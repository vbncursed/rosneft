import { useState } from "react";
import { MetricPanels, type MetricSection } from "./ui/metric-panels";

const wave = (n: number, base: number, amp: number, seed: number, drift = 0) =>
  Array.from({ length: n }, (_, i) =>
    Math.max(0, base + Math.sin((i + seed) * 0.7) * amp + (i / n) * drift),
  );

const SECTIONS: MetricSection[] = [
  {
    key: "traffic",
    title: "Traffic & latency",
    panels: [
      {
        key: "latency",
        title: "Request latency",
        meta: "p50 / p95 / p99 · ms",
        last: "452ms",
        lastTone: "accent",
        unit: "seconds",
        // Values are seconds, matching the unit above, so the chart's spoken
        // summary ("92ms") agrees with what the eye sees ("p50 / p95 / p99 · ms").
        series: [
          { label: "p50", values: wave(24, 0.092, 0.01, 2), tone: "muted", dashed: true },
          { label: "p95", values: wave(24, 0.25, 0.05, 3) },
          { label: "p99", values: wave(24, 0.46, 0.09, 4, -0.04), tone: "bad" },
        ],
      },
      {
        key: "protocol",
        title: "Requests by protocol",
        meta: "rps · http vs grpc",
        last: "142/s",
        series: [
          { label: "http", values: wave(24, 96, 18, 1, 14) },
          { label: "grpc", values: wave(24, 46, 10, 6), tone: "ok" },
        ],
      },
      {
        key: "errors",
        title: "Errors by service",
        meta: "rps · 5xx",
        last: "1.6/s",
        lastTone: "bad",
        series: [
          { label: "gateway", values: wave(24, 0.9, 0.4, 3, 0.5), tone: "bad" },
          { label: "mesh", values: wave(24, 0.3, 0.2, 8), tone: "warn" },
        ],
      },
      {
        key: "sessions",
        title: "Active sessions",
        meta: "count · viewer",
        last: "37",
        series: [{ label: "sessions", values: wave(24, 32, 6, 5, 6) }],
      },
    ],
  },
  {
    key: "domain",
    title: "Domain",
    panels: [
      {
        key: "conversions",
        title: "Conversions by status",
        meta: "cpm · done vs failed",
        last: "6/min",
        series: [
          { label: "done", values: wave(24, 5, 2, 1), tone: "ok" },
          { label: "failed", values: wave(24, 0.7, 0.5, 8), tone: "bad" },
        ],
      },
      {
        key: "queue",
        title: "Queue depth",
        meta: "count · mesh-worker",
        last: "3",
        lastTone: "warn",
        series: [{ label: "depth", values: wave(24, 2.4, 1.4, 5, 1.2), tone: "warn" }],
      },
    ],
  },
];

function Live() {
  const [selected, setSelected] = useState<string | null>("latency");
  return <MetricPanels sections={SECTIONS} selectedKey={selected} onSelect={setSelected} />;
}

export default {
  sections: (
    <div className="max-w-3xl p-6">
      <Live />
    </div>
  ),
  filteredToNothing: (
    <div className="max-w-3xl p-6">
      <MetricPanels sections={[{ key: "go", title: "Go runtime", panels: [] }]} />
    </div>
  ),
};
