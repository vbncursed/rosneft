"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "@/shared/presentation/components/dropdown/use-anchored-position";

export interface ActionItem {
  label: string;
  onClick: () => void;
  tone?: "default" | "amber" | "green" | "red";
}

const TONE: Record<string, string> = {
  default: "text-neutral-200 hover:bg-white/[0.06]",
  amber: "text-amber-200 hover:bg-amber-400/10",
  green: "text-emerald-200 hover:bg-emerald-400/10",
  red: "text-red-300 hover:bg-red-500/10",
};

// RowActionsMenu hides per-row actions behind a kebab (⋯) trigger. The menu is
// portaled to <body> and positioned via useAnchoredPosition because the table
// wrapper clips overflow — an absolute child would be cut off.
export default function RowActionsMenu({ items, ariaLabel }: { items: ActionItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const rect = useAnchoredPosition(btnRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button ref={btnRef} type="button" aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`cursor-pointer rounded-md border px-2 py-1.5 transition-colors ${open ? "border-white/25 bg-white/[0.06] text-white" : "border-white/10 text-neutral-300 hover:bg-white/[0.06] hover:text-white"}`}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>
      {open && rect
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
              <div role="menu" aria-label={ariaLabel}
                style={{ position: "fixed", top: rect.top + rect.height + 6, right: window.innerWidth - (rect.left + rect.width) }}
                className="z-[101] min-w-[11rem] overflow-hidden rounded-lg border border-white/15 bg-[#0c0d10]/98 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
                {items.map((it) => (
                  <button key={it.label} type="button" role="menuitem"
                    onClick={() => { setOpen(false); it.onClick(); }}
                    className={`block w-full cursor-pointer px-3 py-1.5 text-left text-xs transition-colors ${TONE[it.tone ?? "default"]}`}>
                    {it.label}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
