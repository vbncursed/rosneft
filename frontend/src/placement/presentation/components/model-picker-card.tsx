"use client";

import type { PlacementAssetOption } from "@/placement/domain/asset-option";

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

const STEP_BTN =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border border-white/15 bg-black/40 text-neutral-200 transition-colors hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40";

export default function ModelPickerCard({ asset, usable, count, onToggle, onCount }: ModelPickerCardProps) {
  const selected = count !== undefined;

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border transition-colors ${
        selected ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/10"
      } ${usable ? "" : "opacity-40"}`}
    >
      {selected ? (
        <span className="absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-cyan-400 text-black">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      ) : null}

      <button
        type="button"
        disabled={!usable}
        onClick={onToggle}
        title={usable ? asset.title : "Still converting or failed"}
        className={`flex cursor-pointer flex-col text-left disabled:cursor-not-allowed ${
          !selected && usable ? "hover:bg-white/[0.04]" : ""
        }`}
      >
        <span className="flex aspect-square items-center justify-center bg-black/40 text-neutral-600">
          {asset.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" className="size-full object-cover" />
          ) : (
            <CubeIcon />
          )}
        </span>
        <span className="truncate px-2 py-1.5 text-[12px] text-neutral-100" title={asset.title}>
          {asset.title}
          {usable ? null : <span className="ml-1 text-[10px] text-neutral-500">· not converted</span>}
        </span>
      </button>

      {selected ? (
        <div className="flex items-center justify-between gap-1.5 border-t border-white/10 px-2 py-1.5">
          <span className="text-[9px] uppercase tracking-[0.16em] text-neutral-400">Qty</span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={STEP_BTN} disabled={count <= 1} onClick={() => onCount(count - 1)} aria-label="Decrease quantity">−</button>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => onCount(Math.floor(Number(e.target.value)) || 1)}
              className="w-10 rounded border border-white/15 bg-black/40 px-1 py-0.5 text-center text-xs tabular-nums text-neutral-100 outline-none focus:border-cyan-400/60"
            />
            <button type="button" className={STEP_BTN} disabled={count >= 50} onClick={() => onCount(count + 1)} aria-label="Increase quantity">+</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
