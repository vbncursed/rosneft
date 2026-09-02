import type { ReactNode } from "react";
import { ThemeToggle } from "@/features/theme-toggle";
import { Icon } from "@/shared/ui/icon";

export type IntroPoint = {
  title: string;
  hint: string;
};

export type LoginIntroProps = {
  /** Mono line beside the mark, e.g. "Andrey · 3D Platform". */
  brand: string;
  headline: string;
  blurb: string;
  points: IntroPoint[];
  /** Sentence pinned to the foot of the panel. */
  footnote?: ReactNode;
  mark?: string;
};

/** The half of the sign-in card that says what the product is. */
export function LoginIntro({
  brand,
  headline,
  blurb,
  points,
  footnote,
  mark = "A",
}: LoginIntroProps) {
  return (
    <section aria-label="About this platform" className="flex h-full flex-col gap-[26px] p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-[30px] items-center justify-center rounded-control bg-accent text-sm font-bold text-accent-fg"
          >
            {mark}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {brand}
          </span>
        </div>
        <ThemeToggle variant="compact" />
      </div>

      <div>
        <h2 className="m-0 max-w-[22ch] text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-fg">
          {headline}
        </h2>
        <p className="m-0 mt-3.5 max-w-[44ch] text-sm leading-[1.6] text-muted">{blurb}</p>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {points.map((point) => (
          <li key={point.title} className="flex items-start gap-2.5">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="m-0 text-[13px] font-medium text-fg">{point.title}</p>
              <p className="m-0 mt-[3px] text-xs leading-[1.5] text-muted">{point.hint}</p>
            </div>
          </li>
        ))}
      </ul>

      {footnote ? (
        <p className="m-0 mt-auto text-[11px] leading-[1.55] text-dim">
          {footnote}
        </p>
      ) : null}
    </section>
  );
}
