import { AlertRow } from "./ui/alert-row";
import { StatTile } from "./ui/stat-tile";

export default (
  <div className="flex max-w-sm flex-col gap-4">
    <div className="grid grid-cols-2 gap-2.5">
      <StatTile label="Req/s" state={{ kind: "value", value: "142" }} />
      <StatTile label="P95" state={{ kind: "loading" }} />
      <StatTile label="Error rate" state={{ kind: "unavailable" }} />
      <StatTile label="Sessions" state={{ kind: "value", value: "37" }} />
    </div>
    <div className="flex flex-col gap-2 rounded-card border border-line bg-panel p-4">
      <p className="m-0 font-mono text-[9px] uppercase tracking-[0.24em] text-muted">Alerts</p>
      <AlertRow name="HighErrorRate · gateway" severity="firing" />
      <AlertRow name="QueueBacklog · mesh-worker" severity="pending" />
    </div>
  </div>
);
