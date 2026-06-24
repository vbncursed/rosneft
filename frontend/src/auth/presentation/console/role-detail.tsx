"use client";

import { useState } from "react";
import type { Role } from "@/auth/domain/role";
import type { Permission } from "@/auth/domain/permission";
import PermissionMatrix from "@/auth/presentation/console/permission-matrix";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";

// Mounted with key={role.slug} by the panel, so selecting a role gives a fresh
// draft seeded from that role's permissions — no syncing effect needed.
export default function RoleDetail({ role, permissions, onSave, onDelete }: {
  role: Role;
  permissions: Permission[];
  onSave: (slug: string, perms: string[]) => void;
  onDelete: (slug: string) => void;
}) {
  const [draft, setDraft] = useState<string[]>(role.permissionSlugs);
  const toggle = (s: string) => setDraft((d) => (d.includes(s) ? d.filter((x) => x !== s) : [...d, s]));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{role.title} <span className="text-neutral-500">· {role.slug}</span></p>
        {!role.isSystem ? (
          <button type="button" onClick={async () => { if (await confirmAction({ title: "Delete role", message: `Delete role ${role.slug}?`, danger: true })) onDelete(role.slug); }}
            className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20">Delete</button>
        ) : null}
      </div>
      <div className="mt-4"><PermissionMatrix all={permissions} selected={draft} onToggle={toggle} /></div>
      <button type="button" onClick={() => onSave(role.slug, draft)}
        className="mt-5 cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20">Save permissions</button>
    </div>
  );
}
