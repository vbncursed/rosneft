import type { ReactNode } from "react";
import {
  CredentialsForm,
  TwoFactorForm,
  type CredentialsFormProps,
  type TwoFactorFormProps,
} from "@/features/login";
import { Toast } from "@/shared/ui/toast";
import { AuthSteps } from "@/widgets/auth-steps";
import { LoginIntro, type IntroPoint } from "@/widgets/login-intro";

export type LoginStep = "credentials" | "two-factor";

export type LoginPageProps = {
  step: LoginStep;
  intro: {
    brand: string;
    headline: string;
    blurb: string;
    points: IntroPoint[];
    footnote?: ReactNode;
  };
  credentials: CredentialsFormProps;
  /** Present once the password has been accepted and a second factor is due. */
  twoFactor?: Omit<TwoFactorFormProps, "onBack"> & { onBack: () => void };

  /** A failure worth interrupting for — wrong password, expired code. */
  error?: string;
  onDismissError: () => void;
  /** Sentence under the form about how accounts come to exist. */
  footnote?: ReactNode;
};

const STEPS = [
  { key: "credentials", label: "1 · identity" },
  { key: "two-factor", label: "2 · second factor" },
];

const COPY = {
  credentials: {
    eyebrow: "Sign in",
    heading: "Welcome back",
    sub: "Sign in with your email or username.",
  },
  "two-factor": {
    eyebrow: "Two-factor",
    heading: "Enter your code",
    sub: "Six digits from your authenticator app.",
  },
} as const;

// Only when the passkey route is actually on offer — CredentialsForm hides the
// button without `onPasskey`, and copy naming a control that is not drawn
// sends the reader looking for it.
const PASSKEY_SUB = "Use your passkey, or sign in with a password.";

export function LoginPage({
  step,
  intro,
  credentials,
  twoFactor,
  error,
  onDismissError,
  footnote,
}: LoginPageProps) {
  // The second step cannot be shown without the account it belongs to.
  const onTwoFactor = step === "two-factor" && twoFactor !== undefined;
  const copy = COPY[onTwoFactor ? "two-factor" : "credentials"];
  const sub = !onTwoFactor && credentials.onPasskey ? PASSKEY_SUB : copy.sub;

  return (
    <div
      className="relative flex min-h-dvh items-center justify-center bg-bg px-6 py-10 leading-[normal] text-fg"
      style={{
        backgroundImage:
          "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
        backgroundSize: "52px 52px",
      }}
    >
      {error ? (
        <div className="fixed right-4 top-4 z-10 w-[min(92vw,22rem)]">
          <Toast tone="error" onDismiss={onDismissError} className="shadow-elevation">
            {error}
          </Toast>
        </div>
      ) : null}

      <div className="grid w-full max-w-[940px] overflow-hidden rounded-2xl border border-line bg-panel shadow-elevation md:grid-cols-[minmax(300px,1fr)_minmax(320px,380px)]">
        <div className="border-line md:border-r">
          <LoginIntro {...intro} />
        </div>

        <section aria-label="Sign in" className="flex flex-col gap-5 bg-panel-2 p-8">
          <AuthSteps steps={STEPS} current={onTwoFactor ? "two-factor" : "credentials"} />

          <div>
            <p className="m-0 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              {copy.eyebrow}
            </p>
            <h1 className="m-0 mt-[9px] text-[26px] font-bold tracking-[-0.02em]">{copy.heading}</h1>
            <p className="m-0 mt-[7px] text-[13px] leading-[1.55] text-muted">{sub}</p>
          </div>

          {onTwoFactor ? <TwoFactorForm {...twoFactor} /> : <CredentialsForm {...credentials} />}

          {footnote ? (
            <p className="m-0 mt-auto text-[11px] leading-[1.55] text-dim">{footnote}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
