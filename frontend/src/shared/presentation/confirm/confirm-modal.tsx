"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ConfirmRequest } from "@/shared/presentation/confirm/confirm";
import {
  getServerSnapshot,
  getSnapshot,
  resolveActive,
  subscribe,
} from "@/shared/presentation/confirm/confirm-store";

// ConfirmModal renders the single active dialog. Mounted once near
// the root layout. While no request is active, returns null so the
// modal layer adds nothing to the DOM.
export default function ConfirmModal() {
  const req = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return req ? <Dialog request={req} /> : null;
}

function Dialog({ request }: { request: ConfirmRequest }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const field = request.field;
  const canConfirm = !field || value.trim().length > 0;

  // Esc → cancel always. Enter → confirm only for a plain confirm; when the
  // dialog has a field the input's own onKeyDown submits with the typed value
  // (the global listener's closure can't see the latest input state).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (field ? inputRef.current : cancelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolveActive(false);
      else if (e.key === "Enter" && !field) resolveActive(true);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [field]);

  const confirmTone = request.danger
    ? "border-red-300/40 bg-red-500/15 text-red-100 hover:bg-red-500/25"
    : "border-white/30 bg-white/10 text-white hover:bg-white/20";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={request.title ? `confirm-title-${request.id}` : undefined}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) resolveActive(false);
      }}
    >
      <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        {request.title ? (
          <h2
            id={`confirm-title-${request.id}`}
            className="text-base font-semibold tracking-tight text-white"
          >
            {request.title}
          </h2>
        ) : null}
        <p className="text-sm leading-6 text-neutral-300">{request.message}</p>
        {field ? (
          <input
            ref={inputRef}
            type={field.type === "password" ? "password" : "text"}
            inputMode={field.type === "code" ? "numeric" : undefined}
            autoComplete={field.type === "password" ? "current-password" : field.type === "code" ? "one-time-code" : "off"}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canConfirm) resolveActive(true, value);
            }}
            className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/60"
          />
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => resolveActive(false)}
            className="cursor-pointer rounded-md border border-white/20 bg-transparent px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]"
          >
            {request.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => resolveActive(true, value)}
            className={`cursor-pointer rounded-md border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${confirmTone}`}
          >
            {request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
