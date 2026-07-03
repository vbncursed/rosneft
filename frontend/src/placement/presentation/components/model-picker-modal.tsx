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

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// ModelPickerModal is the "add object to territory" picker: a near-fullscreen
// dialog with a search box and a grid of model cards (thumbnail + name;
// unconverted ones greyed out) plus a quantity field. Overlay + keyboard/
// click-out behaviour mirror the shared ConfirmModal.
export default function ModelPickerModal({ assets, onClose, onPlace }: ModelPickerModalProps) {
  const firstUsable = useMemo(() => assets.find(usable)?.slug ?? "", [assets]);
  const [picked, setPicked] = useState(firstUsable);
  const [count, setCount] = useState(1);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? assets.filter((a) => a.title.toLowerCase().includes(q)) : assets;
  }, [assets, query]);

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
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[900px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c0d10]/95 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-white">Add an object</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-neutral-400 focus-within:border-cyan-400/60">
            <SearchIcon />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search objects…"
              aria-label="Search objects"
              className="min-w-0 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {assets.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/15 px-3 py-6 text-center text-sm text-neutral-400">
              No models yet. Upload one under Models first.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/15 px-3 py-6 text-center text-sm text-neutral-400">
              No objects match “{query}”.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((asset) => {
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
                        selected ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/10 hover:border-white/25"
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
                        {ok ? null : <span className="ml-1 text-[10px] text-neutral-500">· not converted</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
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
          <div className="flex shrink-0 gap-2">
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
