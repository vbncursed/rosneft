import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { passkeyMeta, type Passkey } from "../model/passkey";

export type PasskeyRowProps = {
  passkey: Passkey;
  onRemove: () => void;
  /** A removal is in flight for this row. */
  busy?: boolean;
};

export function PasskeyRow({ passkey, onRemove, busy = false }: PasskeyRowProps) {
  return (
    <article className="flex items-center gap-[13px] rounded-[11px] border border-line bg-panel-2 px-[15px] py-[13px]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-line-2 bg-panel text-muted">
        <Icon name="lock" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[13px] font-medium">{passkey.name}</p>
        <p className="m-0 mt-1 font-mono text-[10px] text-muted">{passkeyMeta(passkey)}</p>
      </div>
      {/* Named after its key: a list of these otherwise offers a screen
          reader several controls all called "Remove". The visible label
          stays the design's bare word. */}
      <Button
        variant="danger"
        shape="pill"
        size="sm"
        aria-label={`Remove ${passkey.name}`}
        disabled={busy}
        onClick={onRemove}
      >
        Remove
      </Button>
    </article>
  );
}
