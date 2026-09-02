import { clsx as cx } from "clsx";
import { STAGE_DOT, STAGE_TEXT, type ConversionStage } from "../model/status";

export type StageListProps = {
  stages: ConversionStage[];
  /** Names the list for assistive tech. */
  label?: string;
  className?: string;
};

/** The pipeline's steps, in order, with where it has got to. */
export function StageList({ stages, label = "Conversion stages", className }: StageListProps) {
  return (
    <ul aria-label={label} className={cx("m-0 flex list-none flex-col gap-[7px] p-0", className)}>
      {stages.map((stage) => (
        <li key={stage.label} className="flex items-center gap-2.5">
          {/* The dot repeats what the text tone already says, for a glance. */}
          <span
            aria-hidden="true"
            className={cx("size-[7px] shrink-0 rounded-full", STAGE_DOT[stage.state])}
          />
          <span className={cx("font-mono text-[11px]", STAGE_TEXT[stage.state])}>
            {stage.label}
          </span>
          <span className="ml-auto font-mono text-[10px] text-dim">{stage.time}</span>
        </li>
      ))}
    </ul>
  );
}
