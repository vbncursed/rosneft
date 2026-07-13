"use client";

import { type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { OverlaysTab } from "@/viewer/domain/overlays-tab";
import { slideRight } from "@/shared/presentation/motion/variants";
import { quick } from "@/shared/presentation/motion/transitions";
import { useResolvedVariants } from "@/shared/presentation/motion/reduced-motion";

interface OverlaysPanelProps {
  placementsCount: number;
  // Tab and collapse are controlled by the viewer: the onboarding tour has to
  // reveal a control before it can spotlight one. See use-overlays-panel.ts.
  tab: OverlaysTab;
  onTabChange: (tab: OverlaysTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
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
  tab,
  onTabChange,
  collapsed,
  onCollapsedChange,
  view,
  placements,
}: OverlaysPanelProps) {
  // The panel and its collapsed pill both ride in/out from the right edge; one
  // AnimatePresence across the toggle is what gives collapse its exit slide.
  const panelAnim = useResolvedVariants(slideRight);
  // Tab content rides across: View enters from the left, Placements from the
  // right. Travel is a share of the panel width (not px) so the slide is clearly
  // visible; overflow-x-hidden on the track keeps it from spilling.
  const tabAnim = useResolvedVariants(
    tab === "placements"
      ? { hidden: { opacity: 0, x: "55%" }, visible: { opacity: 1, x: 0 } }
      : { hidden: { opacity: 0, x: "-55%" }, visible: { opacity: 1, x: 0 } },
  );

  return (
    <AnimatePresence mode="wait" initial={false}>
      {collapsed ? (
        <motion.div
          key="collapsed"
          variants={panelAnim}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={quick}
          className="pointer-events-auto self-end"
        >
          <button
            type="button"
            onClick={() => onCollapsedChange(false)}
            aria-label="Expand overlays panel"
            className="flex h-10 cursor-pointer items-center gap-2 rounded-l-xl border border-r-0 border-white/20 bg-black/55 px-3 text-xs uppercase tracking-wider text-neutral-200 backdrop-blur transition-colors hover:bg-black/70"
          >
            <span aria-hidden="true">{"‹"}</span>
            <span>Overlays</span>
          </button>
        </motion.div>
      ) : (
    <motion.aside
      key="expanded"
      variants={panelAnim}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={quick}
      className="pointer-events-auto flex min-h-0 w-[340px] flex-1 flex-col gap-3 rounded-2xl border border-white/15 bg-black/55 p-4 text-neutral-100 shadow-2xl backdrop-blur-md">
      <header className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
          overlays
        </p>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          aria-label="Collapse overlays panel"
          className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/10"
        >
          ›
        </button>
      </header>

      <div
        data-tour="overlays-tabs"
        className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          const label =
            t.id === "placements" ? `${t.label} (${placementsCount})` : t.label;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
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

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pr-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            variants={tabAnim}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={quick}
            className="flex min-h-0 flex-1 flex-col"
          >
            {tab === "view" ? view : placements}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
      )}
    </AnimatePresence>
  );
}
