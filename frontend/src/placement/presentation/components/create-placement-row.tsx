import { useId, useState } from "react";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";

interface CreatePlacementRowProps {
  assets: PlacementAssetOption[];
  disabled: boolean;
  onCreate: (assetSlug: string) => Promise<void> | void;
}

export default function CreatePlacementRow({
  assets,
  disabled,
  onCreate,
}: CreatePlacementRowProps) {
  const selectId = useId();
  const [pickedSlug, setPickedSlug] = useState(assets[0]?.slug ?? "");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <label
        htmlFor={selectId}
        className="text-[10px] uppercase tracking-[0.18em] text-neutral-400"
      >
        Add asset
      </label>
      <div className="flex gap-2">
        <select
          id={selectId}
          value={pickedSlug}
          onChange={(event) => setPickedSlug(event.target.value)}
          disabled={disabled || assets.length === 0}
          className="flex-1 cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-neutral-100 outline-none transition-colors focus:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {assets.length === 0 ? (
            <option value="">no other projects</option>
          ) : (
            assets.map((asset) => (
              <option key={asset.slug} value={asset.slug}>
                {asset.title}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          disabled={disabled || !pickedSlug}
          onClick={() => pickedSlug && onCreate(pickedSlug)}
          className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Place
        </button>
      </div>
    </div>
  );
}
