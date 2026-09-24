import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { enable2FA, meQuery, regenerateRecoveryCodes, setup2FA } from "@/entities/user";
import { HttpError, messageOf } from "@/shared/api";
import { ENROLLMENT_PATH, mustEnroll } from "@/shared/session";
import type { Flow, Stage } from "./steps";

/** Why the enrolment could not start, and whether pressing again could help. */
export type SetupFailure = { message: string; retryable: boolean };

export type TwoFactorState = {
  flow: Flow;
  stage: Stage;
  /** Empty until setup answers; the scan pane shows a skeleton meanwhile. */
  secret: string;
  otpauthUrl: string;
  code: string;
  codes: string[];
  /** A refused code. Setup's own failure is `setupError` — a different place. */
  error: string | null;
  setupError: SetupFailure | null;
  busy: boolean;
  username: string;
  /** Where the wizard's back links lead: the gate while it holds, else the account. */
  exit: { href: string; short: string; long: string };
  onCode: (code: string) => void;
  onConfirm: () => void;
  onRetry: () => void;
  onDone: () => void;
  onCancel: () => void;
};

export const ALREADY_ON = "Two-factor is already on for this account.";

// twofa-service answers FailedPrecondition for "2fa already enabled" and
// apperr.HTTPStatus maps that to 422 — the only precondition setup can fail,
// and re-measured against the running gateway. 409 was the status openapi.yaml
// documented and no server ever sent; the spec was corrected in 89e6517, and
// reading it here invented a terminal dead end for a status nobody sends.
const alreadyOn = (err: unknown) => err instanceof HttpError && err.status === 422;
const ACCOUNT_EXIT = { href: "/account", short: "Account", long: "Back to your account" } as const;
// While the gate holds, /account is a page this session cannot open.
const GATE_EXIT = { href: ENROLLMENT_PATH, short: "Overview", long: "Back to the overview" } as const;
const REFUSED = "Invalid code — check your device clock and try the next one.";

/**
 * The wizard's data. `flow` comes from the route's search; `stage` is
 * component state and deliberately not in the URL — the server issues the
 * recovery codes exactly once, in the body of the call that created them, so
 * a link promising them could not keep the promise after a reload.
 */
export function useTwoFactor(flow: Flow): TwoFactorState {
  const client = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery(meQuery).data ?? null;
  const [stage, setStage] = useState<Stage>("confirm");
  const [secret, setSecret] = useState({ secret: "", otpauthUrl: "" });
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<SetupFailure | null>(null);
  const provisioned = useRef(false);

  // Setup writes — it persists the pending secret — so it runs once per entry,
  // not once per render. React 19's strict-mode double-invoke (main.tsx wraps
  // the app in it) would otherwise provision two secrets and orphan the first.
  const provision = useCallback(() => {
    if (provisioned.current) return;
    provisioned.current = true;
    setSetupError(null);
    setup2FA()
      .then(setSecret)
      .catch((err: unknown) =>
        setSetupError(
          alreadyOn(err)
            ? { message: ALREADY_ON, retryable: false }
            : { message: messageOf(err), retryable: true },
        ),
      );
  }, []);

  useEffect(() => {
    if (flow === "enable") provision();
  }, [flow, provision]);

  const confirm = useMutation({
    mutationFn: (value: string) =>
      flow === "enable" ? enable2FA(value) : regenerateRecoveryCodes(value),
    onSuccess: (issued) => {
      setCodes(issued);
      setStage("codes");
      setError(null);
      void client.invalidateQueries({ queryKey: ["two-factor"] });
      void client.invalidateQueries({ queryKey: ["me"] });
    },
    // A wrong code is `400 invalid_input` here, so neither call carries
    // `credentialed` and a 401 bounces inside the client itself. Nothing to
    // revalidate: whatever lands here is about the code.
    onError: () => {
      setCode("");
      setError(REFUSED);
    },
  });

  const exit = mustEnroll(me) ? GATE_EXIT : ACCOUNT_EXIT;

  // Confirm only invalidated `me`, and the gate route reads the cached one: a
  // stale `totpEnabled: false` would show the gate again instead of "done".
  // A failed fetch still leaves — the gate's own beforeLoad handles it.
  // `totpRequired` is policy and does not change when enrolment lands.
  const done = async () => {
    const fresh = await client.fetchQuery({ ...meQuery, staleTime: 0 }).catch(() => me);
    void (flow === "enable" && fresh?.totpRequired
      ? navigate({ to: ENROLLMENT_PATH, search: { stage: "done" } })
      : navigate({ to: "/account" }));
  };

  return {
    flow,
    stage,
    code,
    codes,
    error,
    setupError,
    secret: secret.secret,
    otpauthUrl: secret.otpauthUrl,
    busy: confirm.isPending,
    username: me?.username ?? "",
    exit,
    onCode: setCode,
    onConfirm: () => confirm.mutate(code),
    onRetry: () => {
      provisioned.current = false;
      provision();
    },
    onDone: () => void done(),
    onCancel: () => void navigate({ to: exit.href }),
  };
}
