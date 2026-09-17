import { clsx as cx } from "clsx";

export type AuthStep = {
  key: string;
  /** e.g. "1 · identity". */
  label: string;
};

export type AuthStepsProps = {
  steps: AuthStep[];
  /** Key of the step being worked on. */
  current: string;
  /** Names the sequence for assistive tech. */
  label?: string;
};

/**
 * Where the reader is in a sign-in flow. Not a radiogroup or a tablist: these
 * are not choices, and a step already passed cannot be returned to by clicking.
 */
export function AuthSteps({ steps, current, label = "Sign-in progress" }: AuthStepsProps) {
  const currentIndex = steps.findIndex((step) => step.key === current);

  return (
    <ol aria-label={label} className="m-0 flex list-none items-center gap-2 p-0">
      {steps.map((step, index) => {
        const active = index === currentIndex;
        const done = currentIndex > index;

        return (
          <li
            key={step.key}
            aria-current={active ? "step" : undefined}
            className={cx(
              "flex items-center gap-[7px] rounded-full border px-3 py-[5px] font-mono text-[9px] uppercase tracking-[0.14em]",
              active
                ? "border-accent bg-accent-soft text-accent"
                : done
                  ? "border-line-2 bg-transparent text-ok"
                  : "border-line-2 bg-transparent text-dim",
            )}
          >
            {step.label}
            {/* Spoken only: the colour says "done" to everyone else. */}
            {done ? <span className="sr-only">completed</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
