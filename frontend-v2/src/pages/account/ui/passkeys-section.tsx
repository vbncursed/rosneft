import { useState } from "react";
import { isPasskeySupported, PasskeyRow, type Passkey } from "@/entities/passkey";
import { AddPasskeyModal, removalFactor, RemovePasskeyModal } from "@/features/passkey-manage";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { EmptyState } from "@/shared/ui/card";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Skeleton } from "@/shared/ui/skeleton";

export type PasskeysSectionProps = {
  /** null is "we could not find out" — never an empty list. */
  passkeys: Passkey[] | null;
  /** Still asking. Distinct from null, which is an answer we failed to get. */
  loading: boolean;
  /** me.totpEnabled: which factor the gateway will demand for a removal. */
  totpEnabled: boolean | null;
  removalBusy: boolean;
  /** Resolves only on success — the dialog closes off this, never on a refused credential. */
  onRemove: (id: string, credential: { code?: string; password?: string }) => Promise<void>;
  onAdded: () => void;
};

/** The registered credentials: the list, adding one, and removing one. */
export function PasskeysSection({
  passkeys,
  loading,
  totpEnabled,
  removalBusy,
  onRemove,
  onAdded,
}: PasskeysSectionProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const supported = isPasskeySupported();

  const add = supported ? (
    <Button variant="accent" shape="pill" size="sm" onClick={() => setAdding(true)}>
      + Add passkey
    </Button>
  ) : null;

  const confirmRemoval = async (credential: { code?: string; password?: string }) => {
    if (!removing) return;
    try {
      await onRemove(removing.id, credential);
      setRemoving(null);
    } catch {
      // The mutation's own onError toasted. Leave the dialog up with what was
      // typed so a mistyped code is one correction away, not a restart.
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-panel p-[22px]">
      <div className="flex items-center gap-3">
        <SectionHeading
          className="flex-1"
          title="Passkeys"
          count={supported && passkeys && !loading ? `${passkeys.length} registered` : undefined}
        />
        {add}
      </div>

      {!supported ? (
        // The desktop shell and any browser without WebAuthn: a ceremony
        // started here cannot succeed, so none is offered.
        <EmptyState
          layout="row"
          icon="lock"
          title="This browser cannot hold passkeys"
          description="Sign in from a browser with WebAuthn support to register one."
        />
      ) : loading ? (
        <div role="status" aria-busy="true" aria-label="Loading passkeys">
          <Skeleton height="60px" />
        </div>
      ) : passkeys === null ? (
        <Callout tone="warn">Passkeys could not be loaded.</Callout>
      ) : passkeys.length === 0 ? (
        <EmptyState
          title="No passkeys yet"
          description="A passkey signs you in with the device you already unlock — no code to type."
        />
      ) : (
        <div className="flex flex-col gap-[9px]">
          {passkeys.map((passkey) => (
            <PasskeyRow
              key={passkey.id}
              passkey={passkey}
              busy={removalBusy && removing?.id === passkey.id}
              onRemove={() => setRemoving(passkey)}
            />
          ))}
        </div>
      )}

      <AddPasskeyModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={onAdded}
      />
      {removing ? (
        <RemovePasskeyModal
          open
          passkey={removing}
          factor={removalFactor(totpEnabled)}
          busy={removalBusy}
          onClose={() => setRemoving(null)}
          onConfirm={(credential) => void confirmRemoval(credential)}
        />
      ) : null}
    </section>
  );
}
