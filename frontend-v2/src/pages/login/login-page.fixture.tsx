import { useState } from "react";
import { LoginPage, type LoginStep } from "./ui/login-page";

const noop = () => {};

const INTRO = {
  brand: "Andrey · 3D Platform",
  headline: "Territories and models, rendered with precision",
  blurb: "Heavy conversion runs server-side — the browser gets a compact GLB instead of a 100 MB OBJ.",
  footnote: "Sessions are stored in a secure cookie your browser sends only to this site.",
  points: [
    { title: "Walk the site in 3D", hint: "Territories open straight in the browser — no plugins, no downloads." },
    { title: "Measure without a trip", hint: "Chain distances across pipe racks, tanks and clearances." },
    { title: "Only what you're assigned", hint: "Your administrator decides which territories you can open." },
  ],
};

const FOOTNOTE =
  "Accounts are created by your company administrator. No access — contact your organisation owner.";

function Live({ initialStep, initialError }: { initialStep: LoginStep; initialError?: string }) {
  const [step, setStep] = useState<LoginStep>(initialStep);
  const [identifier, setIdentifier] = useState("a.ivanova");
  const [password, setPassword] = useState("passwordvalue");
  const [code, setCode] = useState("402");
  const [error, setError] = useState<string | undefined>(initialError);

  return (
    <LoginPage
      step={step}
      intro={INTRO}
      footnote={FOOTNOTE}
      error={error}
      onDismissError={() => setError(undefined)}
      credentials={{
        identifier,
        onIdentifierChange: setIdentifier,
        password,
        onPasswordChange: setPassword,
        onSubmit: () => setStep("two-factor"),
        onPasskey: noop,
      }}
      twoFactor={{
        account: { username: "a.ivanova", email: "a.ivanova@example.com" },
        onChangeAccount: () => setStep("credentials"),
        code,
        onCodeChange: setCode,
        onSubmit: noop,
        onUseRecoveryCode: noop,
        onBack: () => setStep("credentials"),
        expiresIn: "0:24",
      }}
    />
  );
}

export default {
  credentials: <Live initialStep="credentials" />,
  twoFactor: <Live initialStep="two-factor" />,
  rejected: <Live initialStep="credentials" initialError="Invalid username or password." />,
};
