import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

/** What an eye shows for everything it covers. */
export type EyeState = "visible" | "hidden" | "mixed";

export type EyeButtonProps = {
  state: EyeState;
  /** What the eye covers, as its name reads: `storage-tank-500 #2`, `group East yard`, `phase Prior job`. */
  subject: string;
  /** Nothing to toggle (an empty group): dims. */
  disabled?: boolean;
  /** Its write is in flight: waits, does not dim — busy is not unavailable. */
  busy?: boolean;
  /** Called with the next `hidden`: a mixed eye hides everything. */
  onToggle: (hidden: boolean) => void;
};

/**
 * The one eye on anything hidden for everyone — a placement, a model row, a
 * group, a panorama, a job phase. A toggle, so the name stays one verb and the
 * state is read from `aria-pressed` — true when all of it is hidden, "mixed"
 * when some is — never guessed from the glyph.
 */
export function EyeButton({ state, subject, disabled = false, busy = false, onToggle }: EyeButtonProps) {
  const hidden = state === "hidden";
  const waiting = busy && !disabled;
  return (
    <Button
      shape="icon"
      size="xs"
      variant="ghost"
      aria-label={`Hide ${subject}`}
      aria-pressed={state === "mixed" ? "mixed" : hidden}
      tooltip={{ label: hidden ? `Show ${subject}` : `Hide ${subject}` }}
      // Waits through aria-disabled, not `disabled`: its own click starts the
      // write, and a natively disabled button drops that focus to <body>.
      // A write in flight is busy, not unavailable: it neither dims nor gives
      // hover or press feedback for a click that will do nothing. Only nothing
      // to toggle dims — spelled here, since Button dims only a real `disabled`.
      aria-disabled={disabled || busy || undefined}
      aria-busy={waiting || undefined}
      data-dim={disabled || undefined}
      className="aria-busy:cursor-progress aria-disabled:hover:bg-transparent aria-disabled:active:scale-100 data-[dim=true]:cursor-not-allowed data-[dim=true]:opacity-55"
      onClick={() => {
        if (!disabled && !busy) onToggle(!hidden);
      }}
    >
      <Icon name={hidden ? "eye-off" : "eye"} size={12} />
      {state === "mixed" ? (
        <span
          aria-hidden="true"
          data-testid="eye-mixed"
          className="absolute right-[3px] top-[3px] size-[5px] rounded-full bg-muted"
        />
      ) : null}
    </Button>
  );
}
