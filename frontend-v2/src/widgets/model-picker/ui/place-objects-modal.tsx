import { useState } from "react";
import type { ModelOption } from "@/entities/scene";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { QuantityStepper } from "@/shared/ui/quantity-stepper";
import { SearchField } from "@/shared/ui/search-field";
import { ModelPicker } from "./model-picker";

export type PlaceObjectsModalProps = {
  open: boolean;
  onClose: () => void;
  territoryTitle: string;
  options: ModelOption[];
  /** Non-null while the placements are being written, one after another. */
  placing: { done: number; total: number } | null;
  onPlace: (slug: string, count: number) => void;
};

const MAX = 99;

/**
 * The card's sub line: "3 LODs · 8.0 MB", and nothing at all for a chain that
 * does not exist yet — that card already says "· n/a".
 *
 * Binary MB, one decimal: the brief's "8.4 MB" for 8_400_002 bytes was a
 * decimal-megabyte literal, and every other size in this app is binary.
 *
 * `formatBytes` is the app's size helper everywhere else, but it rounds below
 * a gigabyte — every model in a realistic library would read "8 MB", and the
 * mock's line exists to tell two chains apart. One decimal, binary MB (the
 * divisor `formatBytes` itself uses), so the two never disagree by more than
 * the rounding.
 */
const modelMeta = (option: ModelOption) => {
  const levels = option.chain.length;
  if (levels === 0) return undefined;
  const mb = (option.chain.reduce((sum, a) => sum + a.size, 0) / 1_048_576).toFixed(1);
  return `${levels} ${levels === 1 ? "LOD" : "LODs"} · ${mb} MB`;
};

/**
 * The dialog's state — the query, the selection and the count — lives one
 * level down, so closing it unmounts the lot and a reopen starts clean. Kept
 * here rather than reset in an effect: an effect races the frame the reader
 * sees, and the previous "Place 2 × storage-tank-500" was on screen for it.
 */
export function PlaceObjectsModal({ open, ...rest }: PlaceObjectsModalProps) {
  return open ? <PlaceObjectsBody {...rest} /> : null;
}

function PlaceObjectsBody({
  onClose,
  territoryTitle,
  options,
  placing,
  onPlace,
}: Omit<PlaceObjectsModalProps, "open">) {
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [count, setCount] = useState(1);

  const needle = query.trim().toLowerCase();
  const shown = options.filter((o) => o.title.toLowerCase().includes(needle));
  const selected = options.find((o) => o.slug === selectedSlug) ?? null;

  const models = shown.map((option) => ({
    // ModelPickerCard reads a Model's title, slug and thumbnail; a ModelOption
    // carries no source hash and no usage count, and the card asks for
    // neither — the two fillers keep the picker's existing prop type.
    model: {
      slug: option.slug,
      title: option.title,
      thumbnailBlobHash: option.thumbnailBlobHash,
      sourceBlobHash: "",
      usageCount: 0,
    },
    unavailable: option.chain.length === 0,
    meta: modelMeta(option),
  }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Add objects to ${territoryTitle}`}
      description="Pick a model from the library, set how many instances to drop, then place them in the viewport."
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Quantity
            </span>
            {/* The stepper sits in the footer, per the viewer mock; the
                card-level one is the model page's. Its buttons read
                "Decrease storage-tank-500 quantity" rather than the mock's
                "One fewer storage-tank-500" — a recorded rewording, since the
                shared control names itself from one label. */}
            <QuantityStepper
              value={count}
              onChange={setCount}
              min={1}
              max={MAX}
              disabled={placing !== null}
              label={selected ? `${selected.title} quantity` : "Quantity"}
            />
          </div>

          <div className="flex items-center gap-3">
            {placing ? <PlacingLine {...placing} /> : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={placing !== null}
              disabled={selected === null}
              onClick={() => selected && onPlace(selected.slug, count)}
            >
              {selected ? `Place ${count} × ${selected.title}` : "Place"}
            </Button>
          </div>
        </div>
      }
    >
      <SearchField
        value={query}
        onChange={setQuery}
        label="Search the model library"
        placeholder="Search the model library"
      />
      <ModelPicker
        models={models}
        columns={4}
        thumb="band"
        emptyCopy="Nothing matches your search."
        selectedSlug={selectedSlug}
        onSelect={setSelectedSlug}
      />
    </Modal>
  );
}

function PlacingLine({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <p className="m-0 flex items-center gap-2">
      <span
        role="progressbar"
        aria-label="Placing"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        // panel-2, not panel: the dialog's own ground is panel, and the unfilled
        // half of the track vanished into it in the light theme.
        className="block h-[3px] w-[70px] shrink-0 overflow-hidden rounded-full bg-panel-2"
      >
        <span
          className="block h-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-[10px] text-accent">{`Placing ${done} of ${total}…`}</span>
    </p>
  );
}
