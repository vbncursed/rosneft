import { StatTile, type StatTileTone } from "@/entities/metric";
import { CoverageMeter, type CoverageSegment, type CoverageTone } from "@/shared/ui/coverage-meter";

export type StatsRowStat = { label: string; value: string; hint: string; tone?: StatTileTone };

export type StatsRowProps = {
  /** The population split on the left: a label, a mono readout and its segments. */
  meter: { label: string; detail: string; segments: CoverageSegment[] };
  /** Tone of the readout; defaults to the first segment's. */
  detailTone?: CoverageTone;
  stats: StatsRowStat[];
};

/** The console screens' summary band: one coverage meter, then a tile per figure. */
export function StatsRow({ meter, detailTone, stats }: StatsRowProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
      <CoverageMeter
        label={meter.label}
        detail={meter.detail}
        {...(detailTone ? { detailTone } : {})}
        segments={meter.segments}
        className="rounded-[11px] border border-line bg-panel px-4.5 py-4"
      />
      {stats.map((stat) => (
        <StatTile
          key={stat.label}
          size="lg"
          label={stat.label}
          state={{ kind: "value", value: stat.value }}
          hint={stat.hint}
          tone={stat.tone ?? "fg"}
        />
      ))}
    </div>
  );
}
