import { useId } from "react";
import { Range } from "@/shared/ui/range";
import { Switch } from "@/shared/ui/switch";
import { NO_PLAN_NOTE, PLAN_OPACITY, PLAN_SWITCH, ZONES_OVERLINE, ZONES_SWITCH, zonesCount } from "../model/copy";
import { SectionHead } from "./section-head";

export type ZonesSectionProps = {
  count: number;
  show: boolean;
  onToggle: () => void;
  plan: {
    /** A document of this territory is aligned to the model. */
    available: boolean;
    show: boolean;
    onToggle: () => void;
    opacity: number;
    onOpacity: (opacity: number) => void;
  };
};

const SWITCH_ROW = "flex items-center justify-between gap-2.5";
const SWITCH_LABEL = "font-mono text-[13px] text-fg";
const OPACITY_MIN = 0.1;

/** The View tab's Zones section: whether the zones and the aligned plan are drawn over the model. */
export function ZonesSection({ count, show, onToggle, plan }: ZonesSectionProps) {
  const zonesId = useId();
  const planId = useId();
  return (
    <section aria-label={ZONES_OVERLINE} data-tour="zones-section" className="flex flex-col gap-[9px]">
      <SectionHead overline={ZONES_OVERLINE} count={zonesCount(count)} />
      <div className={SWITCH_ROW}>
        <span id={zonesId} className={SWITCH_LABEL}>
          {ZONES_SWITCH}
        </span>
        <Switch checked={show} onChange={onToggle} label={ZONES_SWITCH} labelledBy={zonesId} />
      </div>
      <div className={SWITCH_ROW}>
        <span id={planId} className={SWITCH_LABEL}>
          {PLAN_SWITCH}
        </span>
        <Switch
          checked={plan.show && plan.available}
          onChange={plan.onToggle}
          label={PLAN_SWITCH}
          labelledBy={planId}
          disabled={!plan.available}
        />
      </div>
      {plan.available ? null : <p className="m-0 text-[11px] leading-[1.55] text-muted">{NO_PLAN_NOTE}</p>}
      {plan.available && plan.show ? (
        <Range
          value={plan.opacity}
          min={OPACITY_MIN}
          max={1}
          step={0.05}
          onChange={plan.onOpacity}
          label={PLAN_OPACITY}
        />
      ) : null}
    </section>
  );
}
