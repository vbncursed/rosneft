import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import type { EyeState } from "../model/sections";

export type EyeButtonProps = {
  state: EyeState;
  /** What the eye covers, as its name reads: `storage-tank-500 #2`, `every storage-tank-500`, `group East yard`. */
  subject: string;
  disabled?: boolean;
  /** Called with the next `hidden`: a mixed eye hides everything. */
  onToggle: (hidden: boolean) => void;
};

/**
 * The one eye on an instance, a model row and a user group. A toggle, so the
 * name stays one verb and the state is read from `aria-pressed` — true when all
 * of it is hidden, "mixed" when some is — never guessed from the glyph.
 */
export function EyeButton({ state, subject, disabled = false, onToggle }: EyeButtonProps) {
  const hidden = state === "hidden";
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
      // Button dims only a real `disabled`, so the dimming is spelled here.
      aria-disabled={disabled || undefined}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
      onClick={() => {
        if (!disabled) onToggle(!hidden);
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
