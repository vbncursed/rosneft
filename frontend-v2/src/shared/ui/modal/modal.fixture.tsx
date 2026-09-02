import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { OtpInput } from "@/shared/ui/otp-input";
import { PasswordField } from "@/shared/ui/password-field";
import { Modal } from "./modal";

function Confirm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Make Root
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        overline="Confirm · default"
        title="Make Root"
        description="Grant Root to d.smirnov? Root has every permission and can manage everyone."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Make Root
            </Button>
          </>
        }
      />
    </>
  );
}

function Danger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Remove passkey
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        overline="Confirm · danger + input"
        title="Remove passkey"
        description="Enter your account password to confirm removal."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Remove
            </Button>
          </>
        }
      >
        <PasswordField label="Password" />
      </Modal>
    </>
  );
}

function Otp() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("402");
  return (
    <>
      <Button onClick={() => setOpen(true)}>Disable 2FA</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        overline="Confirm · OTP"
        title="Disable 2FA"
        description="Enter a current authenticator code."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={code.length < 6}>
              Confirm
            </Button>
          </>
        }
      >
        <OtpInput value={code} onChange={setCode} className="justify-center" />
        <button
          type="button"
          className="cursor-pointer self-start border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
        >
          Use a recovery code instead
        </button>
      </Modal>
    </>
  );
}

export default (
  <div className="flex flex-wrap gap-3 rounded-card border border-line bg-panel p-6">
    <Confirm />
    <Danger />
    <Otp />
  </div>
);
