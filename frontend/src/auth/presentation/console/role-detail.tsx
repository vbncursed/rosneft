"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/auth/domain/role";
import type { Permission } from "@/auth/domain/permission";
import PermissionMatrix from "@/auth/presentation/console/permission-matrix";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";

// Mounted with key={role.slug} by the panel, so selecting a role gives a fresh
// draft seeded from that role's permissions — no syncing effect needed.
export default function RoleDetail({ role, permissions, onSave, onDelete }: {
  role: Role;
  permissions: Permission[];
  onSave: (slug: string, perms: string[]) => void;
  onDelete: (slug: string) => void;
}) {
  const me = useCurrentUser();
  // Permissions the actor may put on a role: its own (or everything if owner).
  const grantable = useMemo(
    () => (me?.isOwner ? undefined : new Set(me?.permissions ?? [])),
    [me],
  );
  const [draft, setDraft] = useState<string[]>(role.permissionSlugs);
  const toggle = (s: string) => setDraft((d) => (d.includes(s) ? d.filter((x) => x !== s) : [...d, s]));
  // A non-owner can't save a role that already carries permissions it lacks.
  const blocked = grantable ? draft.some((s) => !grantable.has(s)) : false;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{role.title}</p>
        {!role.isSystem ? (
          <button type="button" onClick={async () => { if (await confirmAction({ title: "Delete role", message: `Delete role ${role.title}?`, danger: true })) onDelete(role.slug); }}
            className="cursor-pointer rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20">Delete</button>
        ) : null}
      </div>
      <div className="mt-4"><PermissionMatrix all={permissions} selected={draft} onToggle={toggle} grantable={grantable} /></div>
      {blocked ? <p className="mt-3 text-xs text-amber-300/80">This role holds permissions you don&apos;t have — only Root can change it.</p> : null}
      <button type="button" disabled={blocked} onClick={() => onSave(role.slug, draft)}
        className="mt-5 cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">Save permissions</button>
    </div>
  );
}
