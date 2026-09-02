import { AlertsCard } from "./ui/alerts-card";

export default {
  firing: (
    <div className="p-6 max-w-sm">
      <AlertsCard
        alerts={[
          { id: "a", name: "HighErrorRate · gateway", severity: "firing" },
          { id: "b", name: "QueueBacklog · mesh-worker", severity: "pending" },
        ]}
      />
    </div>
  ),
  clear: (
    <div className="p-6 max-w-sm">
      <AlertsCard alerts={[]} />
    </div>
  ),
};
