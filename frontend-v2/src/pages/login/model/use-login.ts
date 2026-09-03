import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { login, verifyTwoFactor } from "@/entities/user";
import { HttpError } from "@/shared/api";
import type { LoginPageProps, LoginStep } from "../ui/login-page";
import { nextTarget } from "./next-target";

const INTRO = {
  brand: "Andrey · 3D Platform",
  headline: "Territories and models, rendered with precision",
  blurb:
    "Heavy conversion runs server-side — the browser gets a compact GLB instead of a 100 MB OBJ.",
  footnote: "Sessions are stored in a secure cookie your browser sends only to this site.",
  points: [
    {
      title: "Walk the site in 3D",
      hint: "Territories open straight in the browser — no plugins, no downloads.",
    },
    {
      title: "Measure without a trip",
      hint: "Chain distances across pipe racks, tanks and clearances.",
    },
    {
      title: "Only what you're assigned",
      hint: "Your administrator decides which territories you can open.",
    },
  ],
};

const FOOTNOTE =
  "Accounts are created by your company administrator. No access — contact your organisation owner.";

const GENERIC_ERROR = "Something went wrong. Try again.";

const messageOf = (err: unknown) => (err instanceof HttpError ? err.message : GENERIC_ERROR);

/**
 * Container for the login screen. Owns the two-step flow and returns exactly
 * `LoginPageProps` so `LoginPage` — and its Cosmos fixtures, which feed the
 * same shape by hand — never change.
 *
 * `onPasskey` is left undefined on purpose: the gateway's passkey RP origin
 * is pinned to the other SPA's dev port, so a ceremony started here cannot
 * succeed.
 */
export function useLogin(): LoginPageProps {
  const navigate = useNavigate();
  // Untyped: the login route declares no validateSearch, and reading it this
  // way avoids reaching into `@/app/router` for the route id, which pages may
  // not import.
  const search = useSearch({ strict: false }) as { next?: string };
  const target = nextTarget(search.next);

  const [step, setStep] = useState<LoginStep>("credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  // Ticked by default, as the mock draws it.
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState("");
  // The token step one's login() hands back and step two must spend. null
  // until a challenge exists, which is also what gates rendering `twoFactor`.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // A client-side transition via `href` (parsed into pathname + search by
  // the router itself), not `location.assign` — a full reload would throw
  // away the CSRF token `login`/`verifyTwoFactor` just set in memory.
  const goToTarget = () => navigate({ href: target });

  const backToCredentials = () => {
    setStep("credentials");
    setCode("");
    setError(undefined);
  };

  const submitCredentials = () => {
    // Guards against a double submit spending the same challenge twice.
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    login(identifier, password, remember)
      .then((result) => {
        if (result.twoFactorRequired) {
          setChallengeToken(result.challengeToken);
          setStep("two-factor");
        } else {
          goToTarget();
        }
      })
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setSubmitting(false));
  };

  const submitTwoFactor = () => {
    if (submitting || challengeToken === null) return;
    setSubmitting(true);
    setError(undefined);
    verifyTwoFactor(challengeToken, code, remember)
      .then(goToTarget)
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setSubmitting(false));
  };

  return {
    step,
    intro: INTRO,
    footnote: FOOTNOTE,
    error,
    onDismissError: () => setError(undefined),
    credentials: {
      identifier,
      onIdentifierChange: setIdentifier,
      password,
      onPasswordChange: setPassword,
      remember,
      onRememberChange: setRemember,
      onSubmit: submitCredentials,
      submitting,
    },
    twoFactor:
      challengeToken === null
        ? undefined
        : {
            account: { username: identifier, email: identifier },
            onChangeAccount: backToCredentials,
            code,
            onCodeChange: setCode,
            onSubmit: submitTwoFactor,
            // No recovery-code flow exists yet; clearing the field lets a
            // recovery code be typed into the same box.
            onUseRecoveryCode: () => setCode(""),
            onBack: backToCredentials,
            submitting,
          },
  };
}
