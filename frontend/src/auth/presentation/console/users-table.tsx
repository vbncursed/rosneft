"use client";

import { useState } from "react";
import { useUsersAdmin } from "@/auth/application/use-users-admin";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { can } from "@/auth/domain/principal";
import UserRow from "@/auth/presentation/console/user-row";
import CreateUserDrawer from "@/auth/presentation/console/create-user-drawer";
import EditRolesDrawer from "@/auth/presentation/console/edit-roles-drawer";
import Dropdown from "@/shared/presentation/components/dropdown/dropdown";
import Checkbox from "@/shared/presentation/components/checkbox";
import type { Role } from "@/auth/domain/role";
import type { AdminUser } from "@/auth/domain/user";

export default function UsersTable({ roles }: { roles: Role[] }) {
  const me = useCurrentUser()!;
  const { users, loading, status, setStatus, includeDeleted, setIncludeDeleted, reload, act } = useUsersAdmin();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  // Root sees everyone via the backend owner bypass, even without users:read_all.
  const scoped = !me.isOwner && !can(me, "users:read_all");
  const roleTitle = (slug: string) => roles.find((r) => r.slug === slug)?.title ?? slug;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-xs text-neutral-400">{scoped ? "Showing users you created" : "All users"}</p>
        </div>
        {can(me, "users:write") ? (
          <button type="button" onClick={() => setCreating(true)} className="cursor-pointer rounded-full bg-white px-5 py-2 text-xs uppercase tracking-[0.2em] text-black hover:bg-cyan-200">+ New user</button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Dropdown label="STATUS" value={status} onChange={setStatus} placeholder="Any"
          options={[{ value: "", label: "Any" }, { value: "active", label: "Active" }, { value: "frozen", label: "Frozen" }, { value: "deleted", label: "Deleted" }]} />
        <Checkbox checked={includeDeleted} onChange={setIncludeDeleted} label="include deleted" />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Roles</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">2FA</th><th /></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-neutral-500">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-neutral-500">No users.</td></tr>
            ) : users.map((u) => <UserRow key={u.id} u={u} me={me} roleTitle={roleTitle} act={act} onEditRoles={setEditing} />)}
          </tbody>
        </table>
      </div>

      {creating ? <CreateUserDrawer roles={roles} onClose={() => setCreating(false)} onCreated={reload} /> : null}
      {editing ? <EditRolesDrawer user={editing} roles={roles} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </div>
  );
}
