import { useState } from "react";
import {
  beginRegistration,
  createCredential,
  finishRegistration,
  isCancelled,
  type Passkey,
} from "@/entities/passkey";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { TextField } from "@/shared/ui/text-field";

type Step = "name" | "ceremony";

export type AddPasskeyModalProps = {
  open: boolean;
  onClose: () => void;
  onAdded: (passkey: Passkey) => void;
  /** Cosmos-only: renders straight into the ceremony body — there is no user
   *  gesture that pauses a real ceremony mid-flight for a screenshot. */
  initialStep?: Step;
};

/** Names a passkey, then runs the browser's create() ceremony against it. */
export function AddPasskeyModal({ open, onClose, onAdded, initialStep = "name" }: AddPasskeyModalProps) {
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState("");

  const close = () => {
    setStep("name");
    setName("");
    onClose();
  };

  // Named before the ceremony runs: backing out of naming leaves nothing on
  // the authenticator, backing out after it would leave an unnamed credential.
  const run = async () => {
    setStep("ceremony");
    try {
      const { optionsJson, flowId } = await beginRegistration();
      const credentialJson = await createCredential(optionsJson);
      onAdded(await finishRegistration(flowId, credentialJson, name.trim()));
      close();
    } catch (err) {
      if (!isCancelled(err)) notify.error(messageOf(err));
      close();
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      overline="Add a passkey"
      title={step === "name" ? "Name this passkey" : "Confirm on your device"}
      description={
        step === "name"
          ? "Name it so you can recognise it later in the list."
          : "Your browser is asking the authenticator to create a credential."
      }
      footer={
        step === "name" ? (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={name.trim() === ""} onClick={() => void run()}>
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
        <TextField
          label="Passkey name"
          placeholder="My device"
          hint="Named before the ceremony runs — backing out of naming leaves nothing on your authenticator."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      ) : (
        <>
          <div className="flex items-center gap-3.5 rounded-[11px] border border-accent-line bg-accent-soft px-[18px] py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-accent bg-panel text-accent">
              <Icon name="lock" size={19} />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[13px] font-medium">Waiting for your device…</p>
              <p className="m-0 mt-1 font-mono text-[11px] text-muted">
                Touch ID · Windows Hello · security key
              </p>
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
