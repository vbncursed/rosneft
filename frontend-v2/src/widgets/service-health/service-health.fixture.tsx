import { useState } from "react";
import { ServiceHealthList } from "./ui/service-health";
import type { ServiceHealth } from "@/entities/metric";

const wave = (n: number, base: number, amp: number, seed: number, drift = 0) =>
  Array.from({ length: n }, (_, i) =>
    Math.max(0, base + Math.sin((i + seed) * 0.7) * amp + (i / n) * drift),
  );

const SERVICES: ServiceHealth[] = [
  { name: "gateway", state: "degraded", meta: "5xx 0.82% · 142 rps · 3 replicas", latency: "18ms", errors: "1.2/s", samples: wave(18, 120, 24, 1, 20) },
  { name: "auth-service", state: "up", meta: "logins 12/min · 2FA 8/min", latency: "24ms", errors: "0.1/s", samples: wave(18, 40, 8, 5) },
  { name: "mesh-worker", state: "degraded", meta: "2 jobs running · queue 3", latency: "1.4s", errors: "0.3/s", samples: wave(18, 18, 6, 9, 4) },
  { name: "audit-service", state: "down", meta: "scrape failed · last seen 2h ago", latency: "—", errors: "—", samples: wave(18, 4, 3, 2, -3) },
  { name: "object-storage", state: "up", meta: "24.6 MB/s upload · 184 GB used", latency: "31ms", errors: "0/s", samples: wave(18, 60, 14, 7) },
];

function Live() {
  const [selected, setSelected] = useState<string | null>("gateway");
  return <ServiceHealthList services={SERVICES} selectedName={selected} onSelect={setSelected} />;
}

export default {
  healthy: (
    <div className="max-w-3xl p-6">
      <Live />
    </div>
  ),
  filteredToNothing: (
    <div className="max-w-3xl p-6">
      <ServiceHealthList services={[]} />
    </div>
  ),
};
