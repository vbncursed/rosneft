import { useState } from "react";
import { beginRegistration, createCredential, finishRegistration, isCancelled, type Passkey } from "@/entities/passkey";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { TextField } from "@/shared/ui/text-field";
import type { RemovalFactor } from "../model/removal-factor";
import { StepUpFields, type StepUpCredential } from "./step-up-fields";

type Step = "name" | "ceremony";

export type AddPasskeyModalProps = {
  open: boolean;
  onClose: () => void;
  onAdded: (passkey: Passkey) => void;
  /** Which factor the gateway will demand before it starts the ceremony. */
  factor: RemovalFactor;
  /** Cosmos-only: renders straight into the ceremony body — there is no user
   *  gesture that pauses a real ceremony mid-flight for a screenshot. */
  initialStep?: Step;
};

/**
 * Names a passkey, re-authenticates, then runs the browser's create() ceremony.
 * Adding a key is as dangerous as removing one (a stolen session could enrol
 * its own, which skips 2FA and outlives a password change), so it asks for the
 * same factor and sends it with the begin call.
 */
export function AddPasskeyModal({ open, onClose, onAdded, factor, initialStep = "name" }: AddPasskeyModalProps) {
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState("");
  const [credential, setCredential] = useState<StepUpCredential | null>(null);
  // Bumped on every way in and every refusal, so the factor fields start empty.
  const [fieldsKey, setFieldsKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset on the way in, never on the way out: the dialog fades for a beat
  // after closing, and a reset there flashed the naming step's title and
  // buttons over a ceremony that had just finished.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(initialStep);
      setName("");
      setCredential(null);
      setFieldsKey((k) => k + 1);
    }
  }

  // Named before the ceremony runs: backing out of naming leaves nothing on
  // the authenticator, backing out after it would leave an unnamed credential.
  const run = async () => {
    if (!credential) return;
    setStep("ceremony");
    let begun: Awaited<ReturnType<typeof beginRegistration>>;
    try {
      begun = await beginRegistration(credential);
    } catch (err) {
      // Refused (a wrong factor is a 403): say so and go back to the form, name kept,
      // factor cleared — the code was spent and a password is one retype away.
      notify.error(messageOf(err));
      setCredential(null);
      setFieldsKey((k) => k + 1);
      setStep("name");
      return;
    }
    try {
      const { optionsJson, flowId } = begun;
      const credentialJson = await createCredential(optionsJson);
      onAdded(await finishRegistration(flowId, credentialJson, name.trim()));
      onClose();
    } catch (err) {
      if (!isCancelled(err)) notify.error(messageOf(err));
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="Add a passkey"
      title={step === "name" ? "Name this passkey" : "Confirm on your device"}
      description={
        step === "name"
          ? "Name it so you can recognise it later, and confirm it is you."
          : "Your browser is asking the authenticator to create a credential."
      }
      footer={
        step === "name" ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={name.trim() === "" || !credential} onClick={() => void run()}>
              Continue
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled loading>
            …
          </Button>
        )
      }
    >
      {step === "name" ? (
        <>
          <TextField
            label="Passkey name"
            placeholder="My device"
            hint="Named before the ceremony runs — backing out of naming leaves nothing on your authenticator."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {factor === "unavailable" ? (
            <Callout tone="warn">
              Two-factor status is unavailable, so a passkey cannot be added right now. Try again shortly.
            </Callout>
          ) : (
            <StepUpFields key={fieldsKey} factor={factor} onChange={setCredential} />
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3.5 rounded-[11px] border border-accent-line bg-accent-soft px-[18px] py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-accent bg-panel text-accent">
              <Icon name="lock" size={19} />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[13px] font-medium">Waiting for your device…</p>
              <p className="m-0 mt-1 font-mono text-[11px] text-muted">Touch ID · Windows Hello · security key</p>
            </div>
          </div>
          <p className="m-0 text-xs leading-[1.5] text-muted">
            Dismissing the system prompt is not an error — nothing is created and no message is shown.
          </p>
        </>
      )}
    </Modal>
  );
}
