"use client";

import { Link, useLocation } from "@tanstack/react-router";

function itemClass(active: boolean) {
  return `rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white"}`;
}

export default function ConsoleSidebar({
  showContent,
  showAccess,
  showMetrics,
  showAudit,
}: {
  showContent: boolean;
  showAccess: boolean;
  showMetrics: boolean;
  showAudit: boolean;
}) {
  const path = useLocation({ select: (l) => l.pathname });
  const isActive = (to: string) => path === to || path.startsWith(to + "/");
  return (
    <nav className="flex flex-col gap-1">
      <Link to="/" className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-400 transition-colors hover:text-white">
        ← Back to site
      </Link>
      <p className="mb-2 text-xs uppercase tracking-[0.36em] text-cyan-300/80">Console</p>
      <Link to="/admin/users" className={itemClass(isActive("/admin/users"))}>
        Users
      </Link>
      <Link to="/admin/roles" className={itemClass(isActive("/admin/roles"))}>
        Roles & Permissions
      </Link>
      {showContent ? (
        <Link to="/admin/content" className={itemClass(isActive("/admin/content"))}>
          Content
        </Link>
      ) : null}
      {showAccess ? (
        <Link to="/admin/territories" className={itemClass(isActive("/admin/territories"))}>
          Territory access
        </Link>
      ) : null}
      {showAudit ? (
        <Link to="/admin/audit" className={itemClass(isActive("/admin/audit"))}>
          Audit journal
        </Link>
      ) : null}
      {showMetrics ? (
        <Link to="/admin/metrics" className={itemClass(isActive("/admin/metrics"))}>
          Metrics
        </Link>
      ) : null}
    </nav>
  );
}
