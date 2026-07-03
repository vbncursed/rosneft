"use client";

import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import QuantityStepper from "@/placement/presentation/components/quantity-stepper";

interface ModelPickerCardProps {
  asset: PlacementAssetOption;
  usable: boolean;
  // undefined = not selected; a number = selected with that quantity.
  count: number | undefined;
  onToggle: () => void;
  onCount: (n: number) => void;
}

function CubeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  );
}

// Card height is constant (square preview + one title line) regardless of
// selection: the quantity stepper and the checkmark are absolute overlays on
// the preview, never added to the layout flow — so grid rows never jump.
export default function ModelPickerCard({ asset, usable, count, onToggle, onCount }: ModelPickerCardProps) {
  const selected = count !== undefined;

  return (
    <div
      className={`overflow-hidden rounded-xl border transition-colors ${
        selected ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/10"
      } ${usable ? "" : "opacity-40"}`}
    >
      <div className="relative aspect-square bg-black/40">
        <span className="flex size-full items-center justify-center text-neutral-600">
          {asset.thumbnailUrl ? (
            // object-contain: objects can be tall or wide — show the whole
            // thumbnail (letterboxed) rather than cropping it to the square.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" className="size-full object-contain p-1" />
          ) : (
            <CubeIcon />
          )}
        </span>

        {/* Transparent toggle covering the preview. Kept as a sibling (not a
            parent) of the stepper so nesting interactive controls stays valid. */}
        <button
          type="button"
          disabled={!usable}
          onClick={onToggle}
          aria-label={`${selected ? "Deselect" : "Select"} ${asset.title}`}
          title={usable ? asset.title : "Still converting or failed"}
          className="absolute inset-0 cursor-pointer disabled:cursor-not-allowed"
        />

        {selected ? (
          <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-cyan-400 text-black">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
        ) : null}

        {selected ? (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center bg-black/70 px-2 py-1.5 backdrop-blur-sm">
            <QuantityStepper value={count} onChange={onCount} label={asset.title} />
          </div>
        ) : null}
      </div>

      <p className="truncate px-2 py-1.5 text-[12px] text-neutral-100" title={asset.title}>
        {asset.title}
        {usable ? null : <span className="ml-1 text-[10px] text-neutral-500">· not converted</span>}
      </p>
    </div>
  );
}
