import { useState } from "react";
import type { Passkey } from "@/entities/passkey";
import { Button } from "@/shared/ui/button";
import { AddPasskeyModal } from "./add-passkey-modal";
import { RemovePasskeyModal } from "./remove-passkey-modal";

const PASSKEY: Passkey = {
  id: "pk-1",
  name: "MacBook Pro",
  createdAt: "2026-08-12T00:00:00Z",
  lastUsedAt: "2026-09-07T00:00:00Z",
};

function AddName() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Add a passkey</Button>
      {open ? <AddPasskeyModal open onClose={() => setOpen(false)} onAdded={() => setOpen(false)} /> : null}
    </div>
  );
}

/** initialStep is Cosmos-only — there is no user gesture that pauses a real ceremony mid-flight. */
function AddCeremony() {
  return (
    <div className="p-6">
      <AddPasskeyModal open initialStep="ceremony" onClose={() => {}} onAdded={() => {}} />
    </div>
  );
}

function RemoveCode() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Remove passkey
      </Button>
      {open ? (
        <RemovePasskeyModal
          open
          passkey={PASSKEY}
          factor="code"
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RemovePassword() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Remove passkey
      </Button>
      {open ? (
        <RemovePasskeyModal
          open
          passkey={{ ...PASSKEY, name: "YubiKey 5C" }}
          factor="password"
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RemoveUnavailable() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Remove passkey
      </Button>
      {open ? (
        <RemovePasskeyModal
          open
          passkey={PASSKEY}
          factor="unavailable"
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default {
  "add · name": <AddName />,
  "add · ceremony": <AddCeremony />,
  "remove · code": <RemoveCode />,
  "remove · password": <RemovePassword />,
  "remove · unavailable": <RemoveUnavailable />,
};
