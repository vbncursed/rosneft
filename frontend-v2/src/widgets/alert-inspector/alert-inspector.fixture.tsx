import { AlertInspector, type FiringAlert } from "./ui/alert-inspector";

const noop = () => {};

const wave = (n: number, base: number, amp: number, seed: number, drift = 0) =>
  Array.from({ length: n }, (_, i) =>
    Math.max(0, base + Math.sin((i + seed) * 0.7) * amp + (i / n) * drift),
  );

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

export default {
  firing: (
    <div className="max-w-sm p-6">
      <AlertInspector
        alert={ALERT}
        onClose={noop}
        onSilence={noop}
        onOpenInAudit={noop}
        onCopyPromQl={noop}
      />
    </div>
  ),
  noThreshold: (
    <div className="max-w-sm p-6">
      <AlertInspector
        alert={{ ...ALERT, name: "QueueBacklog", meta: "mesh-worker · severity: warning", threshold: undefined, contributors: [] }}
        onClose={noop}
        onSilence={noop}
        onOpenInAudit={noop}
        onCopyPromQl={noop}
      />
    </div>
  ),
};
