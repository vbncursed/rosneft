"use client";

import Link from "next/link";
import { useState } from "react";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";

export default function UserMenu() {
  const p = useCurrentUser();
  const [open, setOpen] = useState(false);
  if (!p) return null;

  const initials = (p.username || p.email).slice(0, 2).toUpperCase();
  const showConsole = can(p, "users:read") || can(p, "roles:read");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // hard navigation: forces the root layout to re-run getCurrentUser (now null)
    // so the avatar disappears — router.replace is soft and keeps the stale layout
    window.location.assign("/login");
  }

  return (
    <div className="fixed right-4 top-4 z-50">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-tour="user-menu"
        className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/50 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70">
        {initials}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-white/15 bg-[#0c0d10]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-white">{p.username}</p>
              <p className="truncate text-xs text-neutral-400">{p.email}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {p.roleSlugs.map((r) => (
                  <span key={r} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">{r}</span>
                ))}
              </p>
            </div>
            <div className="my-1 h-px bg-white/10" />
            {showConsole ? (
              <Link href="/admin/users" onClick={() => setOpen(false)} role="menuitem"
                className="block rounded-md px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/10">Console</Link>
            ) : null}
            <Link href="/account" onClick={() => setOpen(false)} role="menuitem"
              className="block rounded-md px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/10">Account</Link>
            <button type="button" onClick={logout} role="menuitem"
              className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-red-200 transition-colors hover:bg-red-500/15">Log out</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
