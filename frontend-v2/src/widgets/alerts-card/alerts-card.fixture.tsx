import { AlertsCard } from "./ui/alerts-card";

export default {
  firing: (
    <div className="max-w-sm">
      <AlertsCard
        alerts={[
          { id: "a", name: "HighErrorRate · gateway", severity: "firing" },
          { id: "b", name: "QueueBacklog · mesh-worker", severity: "pending" },
        ]}
      />
    </div>
  ),
  clear: (
    <div className="max-w-sm">
      <AlertsCard alerts={[]} />
    </div>
  ),
};
