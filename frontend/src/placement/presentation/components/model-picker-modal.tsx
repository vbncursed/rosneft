"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";

interface ModelPickerModalProps {
  assets: PlacementAssetOption[];
  onClose: () => void;
  onPlace: (modelSlug: string, count: number) => void;
}

// A model can be placed only once it has a converted LOD chain — otherwise the
// placement would be invisible. Same rule the old dropdown enforced.
function usable(asset: PlacementAssetOption): boolean {
  return asset.lods.length > 0;
}

function CubeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  );
}

// ModelPickerModal is the "add object to territory" picker: a grid of model
// cards (thumbnail + name; unconverted ones greyed out) plus a quantity field.
// Overlay + keyboard/click-out behaviour mirror the shared ConfirmModal.
export default function ModelPickerModal({ assets, onClose, onPlace }: ModelPickerModalProps) {
  const firstUsable = useMemo(() => assets.find(usable)?.slug ?? "", [assets]);
  const [picked, setPicked] = useState(firstUsable);
  const [count, setCount] = useState(1);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const place = () => {
    if (!picked) return;
    onPlace(picked, count);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add object to territory"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <h2 className="text-base font-semibold tracking-tight text-white">Add an object</h2>

        {assets.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/15 px-3 py-6 text-center text-sm text-neutral-400">
            No models yet. Upload one under Models first.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
            {assets.map((asset) => {
              const ok = usable(asset);
              const selected = asset.slug === picked;
              return (
                <li key={asset.slug}>
                  <button
                    type="button"
                    disabled={!ok}
                    onClick={() => setPicked(asset.slug)}
                    title={ok ? asset.title : "Still converting or failed"}
                    className={`flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected
                        ? "border-cyan-400/60 bg-cyan-400/10"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <span className="flex aspect-square items-center justify-center bg-black/40 text-neutral-600">
                      {asset.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.title}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <CubeIcon />
                      )}
                    </span>
                    <span className="truncate px-2 py-1.5 text-[12px] text-neutral-100">
                      {asset.title}
                      {ok ? null : (
                        <span className="ml-1 text-[10px] text-neutral-500">· not converted</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-1 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            Quantity
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => {
                // ponytail: cap 50 keeps the N sequential POSTs bounded; add a
                // batch endpoint if larger counts are ever needed.
                const n = Math.floor(Number(e.target.value));
                setCount(Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 1);
              }}
              className="w-16 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right text-sm tabular-nums text-neutral-100 outline-none transition-colors focus:border-cyan-400/60"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!picked}
              onClick={place}
              className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Place
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
