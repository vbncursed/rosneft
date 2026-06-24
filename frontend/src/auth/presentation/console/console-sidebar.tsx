"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/roles", label: "Roles & Permissions" },
];

export default function ConsoleSidebar({ showContent }: { showContent: boolean }) {
  const path = usePathname();
  const items = showContent ? [...ITEMS, { href: "/admin/content", label: "Content" }] : ITEMS;
  return (
    <nav className="flex flex-col gap-1">
      <Link href="/" className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">
        ← Back to site
      </Link>
      <p className="mb-2 text-xs uppercase tracking-[0.36em] text-cyan-300/80">Console</p>
      {items.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white"}`}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
