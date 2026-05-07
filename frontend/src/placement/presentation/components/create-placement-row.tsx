import { useId, useMemo, useState } from "react";
import Link from "next/link";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";

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

export default function CreatePlacementRow({
  assets,
  disabled,
  onCreate,
}: CreatePlacementRowProps) {
  const selectId = useId();
  const firstUsable = useMemo(() => assets.find(usable)?.slug ?? "", [assets]);
  const [pickedSlug, setPickedSlug] = useState(firstUsable);
  const noUsable = assets.length === 0 || !assets.some(usable);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <label
        htmlFor={selectId}
        className="text-[10px] uppercase tracking-[0.18em] text-neutral-400"
      >
        Add model
      </label>
      <div className="flex gap-2">
        <select
          id={selectId}
          value={pickedSlug}
          onChange={(event) => setPickedSlug(event.target.value)}
          disabled={disabled || noUsable}
          className="flex-1 cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-neutral-100 outline-none transition-colors focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {assets.length === 0 ? (
            <option value="">нет моделей</option>
          ) : (
            assets.map((asset) => (
              <option
                key={asset.slug}
                value={asset.slug}
                disabled={!usable(asset)}
              >
                {asset.title}
                {!usable(asset) ? " — не сконвертирован" : ""}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          disabled={disabled || !pickedSlug || noUsable}
          onClick={() => pickedSlug && onCreate(pickedSlug)}
          className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Place
        </button>
      </div>
      {noUsable && assets.length > 0 ? (
        <p className="text-[10px] text-neutral-500">
          Все модели либо ещё конвертируются, либо упали. Открой{" "}
          <Link href="/models" className="text-cyan-300 underline">/models</Link>.
        </p>
      ) : null}
    </div>
  );
}
