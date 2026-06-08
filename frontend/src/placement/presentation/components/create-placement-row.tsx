import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import Dropdown from "@/shared/presentation/components/dropdown/dropdown";
import type { DropdownOption } from "@/shared/presentation/components/dropdown/dropdown-option";

interface CreatePlacementRowProps {
  assets: PlacementAssetOption[];
  disabled: boolean;
  onCreate: (modelSlug: string) => Promise<void> | void;
}

// Pre-compute which models the user can actually drop into the scene.
// A model with an empty LOD chain has no successful conversion yet
// (or the conversion failed) — placing it would create an invisible
// placement, so the picker disables those entries explicitly.
function usable(asset: PlacementAssetOption): boolean {
  return asset.lods.length > 0;
}

const NO_MODELS_VALUE = "";

export default function CreatePlacementRow({
  assets,
  disabled,
  onCreate,
}: CreatePlacementRowProps) {
  const options = useMemo<DropdownOption[]>(
    () =>
      assets.length === 0
        ? [{ value: NO_MODELS_VALUE, label: "no models", disabled: true }]
        : assets.map((asset) => ({
            value: asset.slug,
            label: asset.title,
            disabled: !usable(asset),
            hint: usable(asset) ? undefined : "not converted",
          })),
    [assets],
  );

  const firstUsable = useMemo(() => assets.find(usable)?.slug ?? "", [assets]);
  const [pickedSlug, setPickedSlug] = useState(firstUsable);
  const noUsable = assets.length === 0 || !assets.some(usable);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
        Add model
      </span>
      <div className="flex gap-2">
        <Dropdown
          ariaLabel="Pick a model"
          value={pickedSlug}
          options={options}
          onChange={setPickedSlug}
          disabled={disabled || noUsable}
          placeholder="Pick a model"
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          disabled={disabled || !pickedSlug || noUsable}
          onClick={() => pickedSlug && onCreate(pickedSlug)}
          className="shrink-0 cursor-pointer rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Place
        </button>
      </div>
      {noUsable && assets.length > 0 ? (
        <p className="text-[10px] text-neutral-500">
          All models are still converting or have failed. Open{" "}
          <Link href="/models" className="text-cyan-300 underline">/models</Link>.
        </p>
      ) : null}
    </div>
  );
}
