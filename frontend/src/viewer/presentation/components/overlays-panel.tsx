"use client";

import { useState, type ReactNode } from "react";

type OverlaysTab = "view" | "placements";

interface OverlaysPanelProps {
  placementsCount: number;
  // When a placement gets selected (in the list or the 3D scene) its gizmo
  // and form live in the Placements tab, so we auto-switch there — otherwise
  // a scene click while on the View tab would appear to do nothing.
  selectedPlacementId: number | null;
  view: ReactNode;
  placements: ReactNode;
}

const TABS: { id: OverlaysTab; label: string }[] = [
  { id: "view", label: "View" },
  { id: "placements", label: "Placements" },
];

// OverlaysPanel is the single right-rail panel that hosts every viewer
// overlay control under tabs, instead of the old cluster of free-floating
// pills. It owns the glass chrome, the tab bar, and the collapse toggle;
// each tab's content is supplied as a node so the panel stays decoupled
// from the panorama/placement domains.
export default function OverlaysPanel({
  placementsCount,
  selectedPlacementId,
  view,
  placements,
}: OverlaysPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<OverlaysTab>("view");

  // Adjust the active tab during render (React's recommended alternative to
  // an effect) when the selection transitions to a real placement.
  const [prevSelected, setPrevSelected] = useState(selectedPlacementId);
  if (selectedPlacementId !== prevSelected) {
    setPrevSelected(selectedPlacementId);
    if (selectedPlacementId !== null) setTab("placements");
  }

  if (collapsed) {
    return (
      <div className="pointer-events-auto self-end">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand overlays panel"
          className="flex h-10 cursor-pointer items-center gap-2 rounded-l-xl border border-r-0 border-white/20 bg-black/55 px-3 text-xs uppercase tracking-wider text-neutral-200 backdrop-blur transition-colors hover:bg-black/70"
        >
          <span aria-hidden="true">{"‹"}</span>
          <span>Overlays</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="pointer-events-auto flex min-h-0 w-[340px] flex-1 flex-col gap-3 rounded-2xl border border-white/15 bg-black/55 p-4 text-neutral-100 shadow-2xl backdrop-blur-md">
      <header className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          overlays
        </p>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse overlays panel"
          className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/10"
        >
          ›
        </button>
      </header>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
        {TABS.map((t) => {
          const active = t.id === tab;
          const label =
            t.id === "placements" ? `${t.label} (${placementsCount})` : t.label;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "view" ? view : placements}
      </div>
    </aside>
  );
}
