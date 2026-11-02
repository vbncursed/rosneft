import { useId } from "react";
import { Switch } from "@/shared/ui/switch";
import { ZONES_OVERLINE, ZONES_SWITCH, zonesCount } from "../model/copy";
import { SectionHead } from "./section-head";

export type ZonesSectionProps = {
  count: number;
  show: boolean;
  onToggle: () => void;
};

/** The View tab's Zones section: whether the zones are drawn over the model. */
export function ZonesSection({ count, show, onToggle }: ZonesSectionProps) {
  const zonesId = useId();
  return (
    <section aria-label={ZONES_OVERLINE} data-tour="zones-section" className="flex flex-col gap-[9px]">
      <SectionHead overline={ZONES_OVERLINE} count={zonesCount(count)} />
      <div className="flex items-center justify-between gap-2.5">
        <span id={zonesId} className="font-mono text-[13px] text-fg">
          {ZONES_SWITCH}
        </span>
        <Switch checked={show} onChange={onToggle} label={ZONES_SWITCH} labelledBy={zonesId} />
      </div>
    </section>
  );
}
