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
};

export function ModelPickerCard({
  model,
  selected,
  onSelect,
  quantity,
  onQuantityChange,
  unavailable = false,
}: ModelPickerCardProps) {
  const thumb = thumbnailUrl(model);

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-[10px] border transition-colors duration-150",
        unavailable
          ? "border-line bg-panel-2 opacity-45"
          : selected
            ? "border-accent bg-accent-soft"
            : "border-line-2 bg-panel-2",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={unavailable}
        aria-pressed={selected}
        className="block w-full cursor-pointer border-none bg-transparent p-0 text-left disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span
          className={cx(
            "flex aspect-square items-center justify-center",
            selected ? "text-accent" : "text-dim",
          )}
        >
          {thumb ? (
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="cube" size={26} />
          )}
        </span>
        <span
          className={cx(
            "block px-2 py-1.5 text-[11px]",
            unavailable ? "text-muted" : selected ? "text-accent" : "text-fg",
          )}
        >
          {model.title}
          {unavailable ? " · n/a" : null}
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
          className="absolute right-1.5 top-1.5 flex size-[18px] items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg"
        >
          ✓
        </span>
      ) : null}
    </div>
  );
}
