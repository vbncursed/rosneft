"use client";

import { useSyncExternalStore } from "react";
import type { Toast } from "@/shared/presentation/toast/toast";
import {
  dismiss,
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "@/shared/presentation/toast/toast-store";

// Per-kind palette — keeps the visual contract obvious. The accents
// hold accessibility-grade contrast against the dark glass background.
const tone: Record<Toast["kind"], { ring: string; accent: string; label: string }> = {
  error: {
    ring: "border-red-300/40 bg-red-500/15",
    accent: "text-red-200",
    label: "Error",
  },
  warning: {
    ring: "border-amber-300/40 bg-amber-500/15",
    accent: "text-amber-200",
    label: "Warning",
  },
  info: {
    ring: "border-cyan-300/40 bg-cyan-500/15",
    accent: "text-cyan-200",
    label: "Info",
  },
  success: {
    ring: "border-emerald-300/40 bg-emerald-500/15",
    accent: "text-emerald-200",
    label: "Success",
  },
};

// Toaster renders the global stack. Mounted once near the root layout so
// every page shares the same coordinate system. `pointer-events-none`
// on the outer container lets clicks pass through to the page when no
// toast is under the cursor; individual cards re-enable pointer events
// for their own close button.
export default function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const palette = tone[toast.kind];
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${palette.ring} px-4 py-3 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md`}
    >
      <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${palette.accent}`}>
        {palette.label}
      </span>
      <p className="flex-1 leading-snug text-neutral-100">{toast.message}</p>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="cursor-pointer text-neutral-400 transition-colors hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
