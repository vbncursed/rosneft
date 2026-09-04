import { healthSummary, ServiceRow, type ServiceHealth } from "@/entities/metric";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";

export type ServiceHealthListProps = {
  services: ServiceHealth[];
  selectedName?: string | null;
  onSelect?: (name: string) => void;
  title?: string;
  /** Replaces the "no match" sentence — and its advice — when no filter is to blame. */
  emptyHint?: string;
};

export function ServiceHealthList({
  services,
  selectedName = null,
  onSelect,
  title = "Service health",
  emptyHint,
}: ServiceHealthListProps) {
  if (services.length === 0) {
    return emptyHint ? (
      <EmptyState title={emptyHint} />
    ) : (
      <EmptyState
        title="No services match this filter."
        description="Loosen the filter to see more services."
      />
    );
  }

  return (
    <section aria-label={title}>
      <SectionHeading title={title} count={healthSummary(services)} className="pb-3 pt-0.5" />
      <div className="flex flex-col gap-2.5">
        {services.map((service) => (
          <ServiceRow
            key={service.name}
            service={service}
            selected={service.name === selectedName}
            onSelect={onSelect ? () => onSelect(service.name) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
