import { RecoveryCodes } from "@/features/recovery-codes";
import { ThemeToggle } from "@/features/theme-toggle";
import { Callout } from "@/shared/ui/callout";
import { steps, type Flow, type Stage } from "../model/steps";
import { ALREADY_ON, type TwoFactorState } from "../model/use-two-factor";
import { ConfirmPane } from "./confirm-pane";
import { ScanPane } from "./scan-pane";
import { StepChips } from "./step-chips";

export type TwoFactorPageProps = TwoFactorState;

// The mock draws two headings, one per stage. Regenerating is a third: it is
// not an enrolment, and offering to "enable two-factor" to someone who already
// has it on is simply the wrong sentence.
const TITLE: Record<string, { h1: string; lede: string }> = {
  "enable/confirm": {
    h1: "Enable two-factor",
    lede: "Pair an authenticator app with your account, then confirm one code. Your password alone stops being enough to sign in.",
  },
  "regenerate/confirm": {
    h1: "Replace your recovery codes",
    lede: "Confirm one code from your authenticator. The ten codes you hold now stop working the moment the new ones are issued.",
  },
  codes: {
    h1: "Save your recovery codes",
    lede: "Ten single-use codes, shown once. Store them somewhere other than the device holding your authenticator.",
  },
};

const titleFor = (flow: Flow, stage: Stage) =>
  stage === "codes" ? TITLE.codes! : TITLE[`${flow}/confirm`]!;

/** The wizard, props only: both flows, both stages, and the dead end at 409. */
export function TwoFactorPage(s: TwoFactorPageProps) {
  const { h1, lede } = titleFor(s.flow, s.stage);
  const blocked = s.error === ALREADY_ON;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <a
            href="/account"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
          >
            ← Account
          </a>
          <p className="m-0 mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
            Two-factor
          </p>
          <h1 className="m-0 mt-2.5 text-[30px] font-bold tracking-[-0.025em]">{h1}</h1>
          <p className="m-0 mt-[9px] max-w-[56ch] text-[13px] leading-[1.6] text-muted">{lede}</p>
        </div>
        <ThemeToggle variant="compact" />
      </div>

      {blocked ? null : <StepChips steps={steps(s.flow, s.stage)} />}

      {blocked ? (
        <div className="flex flex-col items-start gap-3">
          <Callout tone="warn" size="lg">
            {ALREADY_ON}
          </Callout>
          <a
            href="/account"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent no-underline hover:underline"
          >
            Back to your account
          </a>
        </div>
      ) : s.stage === "codes" ? (
        <section className="overflow-hidden rounded-[14px] border border-ok bg-panel shadow-elevation">
          <div className="border-b border-line bg-ok-soft px-[26px] py-[22px]">
            <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-ok">
              Step {s.flow === "enable" ? 3 : 2} · save these recovery codes
            </p>
            <p className="m-0 mt-[9px] text-[15px] font-semibold">
              Two-factor is on for {s.username}
            </p>
            <p className="m-0 mt-[5px] max-w-[60ch] text-xs leading-[1.55] text-fg">
              Each code works once and gets you in when your authenticator is lost. They are shown
              only now — regenerating replaces every one of them.
            </p>
          </div>
          <div className="flex flex-col gap-4 px-[26px] py-[22px]">
            <RecoveryCodes codes={s.codes} onConfirm={s.onDone} />
            <Callout tone="warn" size="lg" icon="info">
              Leaving this screen without saving them means your only way back in is an
              administrator reset.
            </Callout>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[14px] border border-accent-line bg-panel shadow-elevation">
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {s.flow === "enable" ? (
              <ScanPane secret={s.secret} otpauthUrl={s.otpauthUrl} />
            ) : null}
            <ConfirmPane
              flow={s.flow}
              code={s.code}
              error={s.error}
              busy={s.busy}
              onCode={s.onCode}
              onConfirm={s.onConfirm}
              onCancel={s.onCancel}
            />
          </div>
        </section>
      )}
    </div>
  );
}
