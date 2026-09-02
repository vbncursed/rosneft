import { ChartLegend, LineChart, type Series } from "./line-chart";

const wave = (n: number, base: number, amp: number, seed: number, drift = 0) =>
  Array.from({ length: n }, (_, i) =>
    Math.max(0, base + Math.sin((i + seed) * 0.7) * amp + (i / n) * drift),
  );

const LATENCY: Series[] = [
  { label: "p50", values: wave(24, 92, 10, 2), tone: "muted", dashed: true },
  { label: "p95", values: wave(24, 250, 50, 3) },
  { label: "p99", values: wave(24, 460, 90, 4, -40), tone: "bad" },
];

const SESSIONS: Series[] = [{ label: "sessions", values: wave(24, 32, 6, 5, 6) }];

export default (
  <div className="grid max-w-3xl gap-4 p-6 md:grid-cols-2">
    <div className="rounded-card border border-line bg-panel p-4">
      <p className="m-0 text-[13px] font-semibold">Request latency</p>
      <LineChart className="mt-3" series={LATENCY} label="Request latency" unit="ms" />
      <ChartLegend className="mt-3" series={LATENCY} />
    </div>
    <div className="rounded-card border border-line bg-panel p-4">
      <p className="m-0 text-[13px] font-semibold">Active sessions</p>
      <LineChart className="mt-3" series={SESSIONS} label="Active sessions" />
      <ChartLegend className="mt-3" series={SESSIONS} />
    </div>
    <div className="rounded-card border border-line bg-panel p-4">
      <p className="m-0 text-[13px] font-semibold">No data yet</p>
      <LineChart className="mt-3" series={[]} label="Nothing" />
    </div>
  </div>
);
