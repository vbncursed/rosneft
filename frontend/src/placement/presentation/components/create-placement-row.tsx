"use client";

import { useState } from "react";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import ModelPickerModal, {
  type PickerSelection,
} from "@/placement/presentation/components/model-picker-modal";

interface CreatePlacementRowProps {
  assets: PlacementAssetOption[];
  disabled: boolean;
  onCreate: (selections: PickerSelection[]) => void;
}

// The create row is now just a trigger: it opens the model picker modal where
// the user sees each model's thumbnail + name and chooses how many to drop.
export default function CreatePlacementRow({
  assets,
  disabled,
  onCreate,
}: CreatePlacementRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        Add object
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-tour="add-object"
        className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Add object
      </button>

      {open ? (
        <ModelPickerModal
          assets={assets}
          onClose={() => setOpen(false)}
          onPlace={onCreate}
        />
      ) : null}
    </div>
  );
}
