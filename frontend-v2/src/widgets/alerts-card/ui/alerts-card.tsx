import { AlertRow, type AlertSeverity } from "@/entities/metric";
import { Card } from "@/shared/ui/card";

export type Alert = {
  id: string;
  name: string;
  severity: AlertSeverity;
};

export type AlertsCardProps = {
  alerts: Alert[];
};

export function AlertsCard({ alerts }: AlertsCardProps) {
  return (
    <Card overline="Alerts" className="p-4">
      <div className="mt-2 flex flex-col gap-2">
        {alerts.length === 0 ? (
          <p className="m-0 text-xs text-muted">All clear. No active alerts.</p>
        ) : (
          alerts.map((alert) => (
            <AlertRow key={alert.id} name={alert.name} severity={alert.severity} />
          ))
        )}
      </div>
    </Card>
  );
}
