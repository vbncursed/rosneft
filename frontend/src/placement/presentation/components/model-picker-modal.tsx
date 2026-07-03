"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import ModelPickerCard from "@/placement/presentation/components/model-picker-card";

export interface PickerSelection {
  modelSlug: string;
  count: number;
}

interface ModelPickerModalProps {
  assets: PlacementAssetOption[];
  onClose: () => void;
  onPlace: (selections: PickerSelection[]) => void;
}

// A model can be placed only once it has a converted LOD chain — otherwise the
// placement would be invisible. Same rule the old dropdown enforced.
function usable(asset: PlacementAssetOption): boolean {
  return asset.lods.length > 0;
}

function clampQty(n: number): number {
  return Number.isFinite(n) ? Math.min(50, Math.max(1, Math.floor(n))) : 1;
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// ModelPickerModal is the "add objects to territory" picker: a ~75%-of-viewport
// dialog with a search box and a grid of model cards. Multiple models can be
// selected at once, each with its own quantity; Place drops them all. Portaled
// to <body> so the panel's backdrop-blur ancestor doesn't trap the fixed layer.
export default function ModelPickerModal({ assets, onClose, onPlace }: ModelPickerModalProps) {
  // slug → chosen quantity. Absent = not selected.
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? assets.filter((a) => a.title.toLowerCase().includes(q)) : assets;
  }, [assets, query]);

  const entries = Object.entries(selected);
  const totalCopies = entries.reduce((sum, [, c]) => sum + c, 0);

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

  const toggle = (slug: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (slug in next) delete next[slug];
      else next[slug] = 1;
      return next;
    });

  const setQty = (slug: string, n: number) =>
    setSelected((prev) => ({ ...prev, [slug]: clampQty(n) }));

  const place = () => {
    if (entries.length === 0) return;
    onPlace(entries.map(([modelSlug, count]) => ({ modelSlug, count })));
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add objects to territory"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[80vh] w-[85vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c0d10]/95 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-white">Add objects</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white">
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
            <p className="rounded-md border border-dashed border-white/15 px-3 py-6 text-center text-sm text-neutral-400">No models yet. Upload one under Models first.</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/15 px-3 py-6 text-center text-sm text-neutral-400">No objects match “{query}”.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((asset) => (
                <li key={asset.slug}>
                  <ModelPickerCard
                    asset={asset}
                    usable={usable(asset)}
                    count={selected[asset.slug]}
                    onToggle={() => toggle(asset.slug)}
                    onCount={(n) => setQty(asset.slug, n)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            {entries.length === 0
              ? "Nothing selected"
              : `${entries.length} object${entries.length > 1 ? "s" : ""} · ${totalCopies} cop${totalCopies > 1 ? "ies" : "y"}`}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]">Cancel</button>
            <button type="button" disabled={entries.length === 0} onClick={place} className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">
              Place
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
