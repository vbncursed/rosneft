import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { QuantityStepper } from "@/shared/ui/quantity-stepper";
import { thumbnailUrl, type Model } from "../model/model";

export type ModelPickerCardProps = {
  model: Model;
  selected: boolean;
  onSelect: () => void;
  /** Absent means the card is a plain toggle with no count. */
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  /** A model whose conversion has not finished cannot be placed. */
  unavailable?: boolean;
  /** Sub line under the title, e.g. "3 LODs · 8.0 MB". */
  meta?: string;
  /** band is the viewer picker's 74px strip; square is the library default. */
  thumb?: "square" | "band";
};

export function ModelPickerCard({
  model,
  selected,
  onSelect,
  quantity,
  onQuantityChange,
  unavailable = false,
  meta,
  thumb = "square",
}: ModelPickerCardProps) {
  const thumbUrl = thumbnailUrl(model);

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-[10px] border transition-[color,background-color,border-color,scale] duration-150 ease-out",
        // No opacity on an unavailable card: fading the whole thing took its
        // own "Not converted yet" below 2:1. The dim title and the plain
        // border say it; the reason prints at full strength.
        unavailable
          ? "border-line bg-panel-2"
          : cx(
              "active:scale-[0.97]",
              selected ? "border-accent bg-accent-soft" : "border-line-2 bg-panel-2",
            ),
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={unavailable}
        aria-pressed={selected}
        // Inset ring: the card's overflow-hidden clipped an outset one whole.
        className="block w-full cursor-pointer border-none bg-transparent p-0 text-left disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <span
          className={cx(
            "flex items-center justify-center",
            // The height is set once per value: a square four-across in the
            // viewer's 720 modal would be 162 tall and push the grid off the
            // screen, which is what the mock's 74px band is for.
            thumb === "band" ? "h-[74px]" : "aspect-square",
            selected ? "text-accent" : "text-dim",
          )}
        >
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="cube" size={26} />
          )}
        </span>
        <span
          className={cx(
            "block px-2 py-1.5 text-[11px]",
            unavailable ? "text-dim" : selected ? "text-accent" : "text-fg",
          )}
        >
          {/* One line, always: a wrapped name made its card taller than the
              row beside it, and the grid stopped reading as a grid. The full
              name rides on `title` for the hover. */}
          <span className="block truncate" title={model.title}>
            {model.title}
          </span>
          {meta ? <span className="block font-mono text-[9px] text-muted">{meta}</span> : null}
        </span>
      </button>

      {selected && quantity !== undefined && onQuantityChange ? (
        <div className="absolute inset-x-0 bottom-[26px] flex justify-center bg-panel py-[3px]">
          <QuantityStepper
            value={quantity}
            onChange={onQuantityChange}
            min={1}
            label={`${model.title} quantity`}
          />
        </div>
      ) : null}

      {selected ? (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex size-[18px] items-center justify-center rounded-full bg-accent text-accent-fg"
        >
          <Icon name="check" size={12} />
        </span>
      ) : null}
    </div>
  );
}
