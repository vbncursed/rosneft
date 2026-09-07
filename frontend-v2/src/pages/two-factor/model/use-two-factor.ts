import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { enable2FA, meQuery, regenerateRecoveryCodes, setup2FA } from "@/entities/user";
import { HttpError, messageOf } from "@/shared/api";
import type { Flow, Stage } from "./steps";

export type TwoFactorState = {
  flow: Flow;
  stage: Stage;
  /** Empty until setup answers; the scan pane shows a skeleton meanwhile. */
  secret: string;
  otpauthUrl: string;
  code: string;
  codes: string[];
  error: string | null;
  busy: boolean;
  username: string;
  onCode: (code: string) => void;
  onConfirm: () => void;
  onDone: () => void;
  onCancel: () => void;
};

export const ALREADY_ON = "Two-factor is already on for this account.";

// twofa-service answers FailedPrecondition for "2fa already enabled" and
// apperr.HTTPStatus maps that to 422 — the only precondition setup can fail.
// 409 is kept because it is the status the endpoint is specified with, and a
// gateway that starts sending it must not regress this screen into printing
// the raw sentinel beside two panes that can no longer do anything.
const alreadyOn = (err: unknown) =>
  err instanceof HttpError && (err.status === 409 || err.status === 422);
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
  const provisioned = useRef(false);

  useEffect(() => {
    // Setup writes — it persists the pending secret — so it runs once per
    // entry, not once per render. React 19's strict-mode double-invoke would
    // otherwise provision two secrets and leave the first one orphaned.
    if (flow !== "enable" || provisioned.current) return;
    provisioned.current = true;
    setup2FA()
      .then(setSecret)
      .catch((err: unknown) => setError(alreadyOn(err) ? ALREADY_ON : messageOf(err)));
  }, [flow]);

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
    onError: () => {
      setCode("");
      setError(REFUSED);
    },
  });

  const leave = () => void navigate({ to: "/account" });

  return {
    flow,
    stage,
    code,
    codes,
    error,
    secret: secret.secret,
    otpauthUrl: secret.otpauthUrl,
    busy: confirm.isPending,
    username: me?.username ?? "",
    onCode: setCode,
    onConfirm: () => confirm.mutate(code),
    onDone: leave,
    onCancel: leave,
  };
}
