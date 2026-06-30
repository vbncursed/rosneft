"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/auth/domain/role";
import type { Permission } from "@/auth/domain/permission";
import PermissionMatrix from "@/auth/presentation/console/permission-matrix";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";

// Mounted with key={role.slug} by the panel, so selecting a role gives a fresh
// draft seeded from that role's permissions — no syncing effect needed.
export default function RoleDetail({ role, permissions, onSave, onRename, onDelete }: {
  role: Role;
  permissions: Permission[];
  onSave: (slug: string, perms: string[]) => void;
  onRename: (slug: string, title: string) => void;
  onDelete: (slug: string) => void;
}) {
  const me = useCurrentUser();
  // Permissions the actor may put on a role: its own (or everything if owner).
  const grantable = useMemo(
    () => (me?.isOwner ? undefined : new Set(me?.permissions ?? [])),
    [me],
  );
  const [draft, setDraft] = useState<string[]>(role.permissionSlugs);
  const [name, setName] = useState(role.title);
  const toggle = (s: string) => setDraft((d) => (d.includes(s) ? d.filter((x) => x !== s) : [...d, s]));
  // A non-owner can't save a role that already carries permissions it lacks.
  const blocked = grantable ? draft.some((s) => !grantable.has(s)) : false;
  const renamed = name.trim().length > 0 && name.trim() !== role.title;
  // System roles are defined by migrations and immutable — the backend refuses
  // edits, so the UI shows them read-only (you can still assign them to users).
  const system = role.isSystem;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="role-name">Role name</label>
        <input id="role-name" value={name} onChange={(e) => setName(e.target.value)} readOnly={system}
          className={`min-w-0 flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-white outline-none transition-colors ${system ? "" : "hover:border-white/15 focus:border-cyan-300/60"}`} />
        {renamed && !system ? (
          <button type="button" onClick={() => onRename(role.slug, name.trim())}
            className="cursor-pointer whitespace-nowrap rounded-md border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-100 hover:bg-cyan-400/20">Rename</button>
        ) : null}
        {!system ? (
          <button type="button" onClick={async () => { if (await confirmAction({ title: "Delete role", message: `Delete role ${role.title}?`, danger: true })) onDelete(role.slug); }}
            className="cursor-pointer whitespace-nowrap rounded-md border border-red-300/40 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-200 hover:bg-red-500/20">Delete</button>
        ) : null}
      </div>
      <div className="mt-4"><PermissionMatrix all={permissions} selected={draft} onToggle={toggle} disabled={system} grantable={grantable} /></div>
      {system ? (
        <p className="mt-3 text-xs text-neutral-500">System role — managed by the platform. Assign it to users from the Users page.</p>
      ) : (
        <>
          {blocked ? <p className="mt-3 text-xs text-amber-300/80">This role holds permissions you don&apos;t have — only Root can change it.</p> : null}
          <button type="button" disabled={blocked} onClick={() => onSave(role.slug, draft)}
            className="mt-5 cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">Save permissions</button>
        </>
      )}
    </div>
  );
}
