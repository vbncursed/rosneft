import { clsx as cx } from "clsx";
import { toneClasses, type ActiveTone, type ConversionStage } from "../model/status";

export type StageListProps = {
  stages: ConversionStage[];
  /** Names the list for assistive tech. */
  label?: string;
  /** Swaps the active stage's dot/text from the conversion warn default to accent. */
  activeTone?: ActiveTone;
  className?: string;
};

/** The pipeline's steps, in order, with where it has got to. */
export function StageList({ stages, label = "Conversion stages", activeTone, className }: StageListProps) {
  const anyHint = stages.some((stage) => stage.hint);

  return (
    <ul aria-label={label} className={cx("m-0 flex list-none flex-col gap-[7px] p-0", className)}>
      {stages.map((stage) => {
        const { dot, text } = toneClasses(stage.state, activeTone);
        return (
          <li key={stage.label} className={cx("flex gap-2.5", anyHint ? "items-start" : "items-center")}>
            {/* The dot repeats what the text tone already says, for a glance. */}
            <span
              aria-hidden="true"
              className={cx("size-[7px] shrink-0 rounded-full", dot, anyHint && "mt-[5px]")}
            />
            <span className="flex-1">
              <span className={cx("font-mono text-[11px]", text)}>{stage.label}</span>
              {stage.hint ? (
                <p className="mt-[3px] text-[11px] leading-[1.45] text-muted">{stage.hint}</p>
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-dim">{stage.time}</span>
          </li>
        );
      })}
    </ul>
  );
}
