import { ModelPickerCard, type Model } from "@/entities/model";

export type PickableModel = {
  model: Model;
  /** A model whose conversion has not finished cannot be placed. */
  unavailable?: boolean;
};

export type ModelPickerProps = {
  models: PickableModel[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** Per-model counts; omit to make the picker a plain single choice. */
  quantities?: Record<string, number>;
  onQuantityChange?: (slug: string, quantity: number) => void;
};

export function ModelPicker({
  models,
  selectedSlug,
  onSelect,
  quantities,
  onQuantityChange,
}: ModelPickerProps) {
  if (models.length === 0) {
    return (
      <p className="m-0 rounded-control border border-dashed border-line-2 px-3 py-[9px] text-[11px] text-muted">
        No models in the library yet.
      </p>
    );
  }

  return (
    <ul aria-label="Models" className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
      {models.map(({ model, unavailable }) => (
        <li key={model.slug}>
          <ModelPickerCard
            model={model}
            selected={model.slug === selectedSlug}
            onSelect={() => onSelect(model.slug)}
            unavailable={unavailable}
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
