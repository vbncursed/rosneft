import { clsx as cx } from "clsx";
import { ModelPickerCard, type Model } from "@/entities/model";

export type PickableModel = {
  model: Model;
  /** A model whose conversion has not finished cannot be placed. */
  unavailable?: boolean;
  /** Sub line under the title, e.g. "3 LODs · 8.0 MB". */
  meta?: string;
};

export type ModelPickerProps = {
  models: PickableModel[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** Per-model counts; omit to make the picker a plain single choice. */
  quantities?: Record<string, number>;
  onQuantityChange?: (slug: string, quantity: number) => void;
  /** The viewer's picker modal is 720 wide and draws four; the default is three. */
  columns?: 3 | 4;
};

export function ModelPicker({
  models,
  selectedSlug,
  onSelect,
  quantities,
  onQuantityChange,
  columns = 3,
}: ModelPickerProps) {
  if (models.length === 0) {
    return (
      <p className="m-0 rounded-control border border-dashed border-line-2 px-3 py-[9px] text-[11px] text-muted">
        No models in the library yet.
      </p>
    );
  }

  return (
    <ul
      aria-label="Models"
      // Spelled out per branch: Tailwind scans for literal class names, so a
      // template literal would compile to nothing.
      className={cx(
        "m-0 grid list-none gap-2.5 p-0",
        columns === 4 ? "grid-cols-4" : "grid-cols-3",
      )}
    >
      {models.map(({ model, unavailable, meta }) => (
        <li key={model.slug}>
          <ModelPickerCard
            model={model}
            selected={model.slug === selectedSlug}
            onSelect={() => onSelect(model.slug)}
            unavailable={unavailable}
            meta={meta}
            quantity={quantities?.[model.slug]}
            onQuantityChange={
              onQuantityChange ? (quantity) => onQuantityChange(model.slug, quantity) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}
