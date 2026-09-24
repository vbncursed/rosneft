import { clsx as cx } from "clsx";
import { ThemeToggle } from "@/features/theme-toggle";
import { Avatar } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { linkButtonClass } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export type TwoFactorRequiredStage = "gate" | "done";

export type TwoFactorRequiredPageProps = {
  stage: TwoFactorRequiredStage;
  username: string;
  onSignOut: () => void;
  signingOut: boolean;
};

const STEPS = [
  {
    title: "Open an authenticator app",
    detail: "1Password, Google Authenticator or any TOTP app on your phone.",
  },
  {
    title: "Scan the code and confirm six digits",
    detail: "A manual key is there if the camera can't read the QR.",
  },
  {
    title: "Save the recovery codes",
    detail: "They are shown once. Each one gets you in if the phone is lost.",
  },
] as const;

// Every per-stage utility lives here, one per property, so no element carries
// a base value and an override for the same property.
const STAGE = {
  gate: {
    card: "border-accent-line",
    head: "px-[30px] pb-6 pt-[30px]",
    tile: "border-accent bg-accent-soft text-accent",
    icon: "lock",
    footer: "justify-between",
    title: "Set up two-factor to continue",
    body: "An administrator requires a second factor on your account. Territories, models and the console stay closed until an authenticator app is linked.",
  },
  done: {
    card: "border-ok",
    head: "p-[30px]",
    tile: "border-ok bg-ok-soft text-ok",
    icon: "check",
    footer: "justify-end",
    title: "You're all set",
    body: "From the next sign-in you'll be asked for a code after your password. Recovery codes can be regenerated from Account.",
  },
} as const;

/**
 * `Two Factor Required v2`: the one screen a session that owes a second factor
 * can open, and the card it lands on once the wizard is through. It sits
 * outside every shell, so it draws its own header — the brand as plain text,
 * the theme toggle and a static identity chip. No account menu: its Account
 * item leads to a page the gateway refuses until enrolment is done.
 */
export function TwoFactorRequiredPage({
  stage,
  username,
  onSignOut,
  signingOut,
}: TwoFactorRequiredPageProps) {
  const s = STAGE[stage];
  return (
    <div className="flex min-h-dvh flex-col gap-10 bg-bg px-4 pb-14 pt-8 text-fg sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
          Andrey Viewer
        </span>
        <div className="flex flex-wrap items-center gap-[9px]">
          <ThemeToggle variant="compact" />
          <span className="flex items-center gap-[9px] rounded-full border border-line-2 bg-panel py-[5px] pl-[5px] pr-[13px]">
            <Avatar name={username} size={28} variant="soft" />
            <span className="text-xs font-medium">{username}</span>
          </span>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <section
          className={cx(
            "w-full max-w-[560px] overflow-hidden rounded-2xl border bg-panel shadow-elevation",
            s.card,
          )}
        >
          <div className={cx("flex flex-col gap-3.5", s.head)}>
            <div className="flex items-center gap-2.5">
              <span
                className={cx(
                  "flex size-[38px] items-center justify-center rounded-control-lg border",
                  s.tile,
                )}
              >
                <Icon name={s.icon} size={18} />
              </span>
              {stage === "gate" ? (
                <Badge tone="accent" fill="outline" size="status">
                  two-factor required
                </Badge>
              ) : (
                <Badge tone="ok" size="status">
                  two-factor on
                </Badge>
              )}
            </div>
            <h1 className="m-0 mt-1 text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-balance">
              {s.title}
            </h1>
            <p className="m-0 max-w-[50ch] text-sm leading-[1.6] text-pretty text-muted">{s.body}</p>
          </div>
          {stage === "gate" && (
            <ol role="list" className="m-0 flex list-none flex-col px-[30px] pb-6">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="grid grid-cols-[28px_1fr] items-start gap-3 border-t border-line py-[13px] last:border-b"
                >
                  {/* The list already numbers itself for a screen reader. */}
                  <span aria-hidden="true" className="pt-px font-mono text-[11px] text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="m-0 text-[13px] font-semibold">{step.title}</p>
                    <p className="m-0 mt-[3px] text-xs leading-[1.5] text-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div
            className={cx(
              "flex flex-wrap items-center gap-3 border-t border-line bg-panel-2 px-[30px] py-[18px]",
              s.footer,
            )}
          >
            {stage === "gate" ? (
              <>
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={signingOut}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-muted transition-[color,scale] duration-150 ease-out hover:text-fg enabled:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
                >
                  Sign out
                </button>
                <a href="/account/two-factor" className={`${linkButtonClass("primary")} gap-2`}>
                  Set up two-factor
                  <Icon name="arrow-right" size={14} />
                </a>
              </>
            ) : (
              <a href="/territories" className={linkButtonClass("primary")}>
                Continue to territories
              </a>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
