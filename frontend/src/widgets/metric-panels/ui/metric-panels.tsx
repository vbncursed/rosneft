import { SectionHeading } from "@/shared/ui/section-heading";
import { EmptyState } from "@/shared/ui/card";
import { MetricPanel, type MetricPanelProps } from "./metric-panel";

export type MetricPanelEntry = Omit<MetricPanelProps, "selected" | "onSelect"> & { key: string };

export type MetricSection = {
  key: string;
  title: string;
  panels: MetricPanelEntry[];
};

export type MetricPanelsProps = {
  sections: MetricSection[];
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  emptyHint?: string;
};

const plural = (n: number) => `${n} ${n === 1 ? "panel" : "panels"}`;

export function MetricPanels({
  sections,
  selectedKey = null,
  onSelect,
  emptyHint = "No panels match this filter.",
}: MetricPanelsProps) {
  const populated = sections.filter((section) => section.panels.length > 0);

  if (populated.length === 0) {
    return <EmptyState title={emptyHint} description="Loosen the filter to see more panels." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {populated.map((section) => (
        <section key={section.key} aria-label={section.title}>
          <SectionHeading
            title={section.title}
            count={plural(section.panels.length)}
            className="pb-3 pt-0.5"
          />
          <div className="grid gap-2.5 md:grid-cols-2">
            {section.panels.map(({ key, ...panel }) => (
              <MetricPanel
                key={key}
                {...panel}
                selected={key === selectedKey}
                onSelect={onSelect ? () => onSelect(key) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
