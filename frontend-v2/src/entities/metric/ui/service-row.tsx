import { clsx as cx } from "clsx";
import { Badge } from "@/shared/ui/badge";
import { Sparkline } from "@/shared/ui/sparkline";
import { isScraped, SERVICE_TONE, type ServiceHealth, type ServiceState } from "../model/service";

export type ServiceRowProps = {
  service: ServiceHealth;
  selected?: boolean;
  onSelect?: () => void;
};

const RAIL: Record<ServiceState, string> = {
  up: "bg-ok",
  degraded: "bg-warn",
  down: "bg-bad",
};

export function ServiceRow({ service, selected = false, onSelect }: ServiceRowProps) {
  const down = service.state === "down";
  const scraped = isScraped(service);

  return (
    <article
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={service.name}
      className={cx(
        "relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-[11px] border py-3.5 pl-4.5 pr-4 transition-colors duration-150",
        down ? "border-bad bg-bad-soft" : selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-2",
      )}
    >
      <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-[3px]", RAIL[service.state])} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="min-w-0 truncate font-mono text-[13px] text-fg">{service.name}</span>
          <Badge
            shape="tag"
            size="sm"
            fill="outline"
            tone={SERVICE_TONE[service.state]}
            className="tracking-[0.12em]"
          >
            {service.state}
          </Badge>
        </div>
        <p className="m-0 mt-[5px] truncate font-mono text-[10px] text-muted">{service.meta}</p>
      </div>

      <Sparkline
        showHeader={false}
        highlight="last"
        values={service.samples}
        label={`${service.name} throughput`}
        unit="per sample"
        className="h-7 w-[118px] shrink-0"
      />

      <div className="flex shrink-0 items-center gap-3.5">
        {/* A service that is not answering has no numbers worth reading; the
            dash is the honest reading, and it is dimmed rather than coloured. */}
        <span
          className={cx(
            "w-14 text-right font-mono text-xs",
            scraped ? "text-fg" : "text-dim",
          )}
        >
          {service.latency}
        </span>
        <span className="w-13 text-right font-mono text-[11px] text-dim">{service.errors}</span>
      </div>
    </article>
  );
}
