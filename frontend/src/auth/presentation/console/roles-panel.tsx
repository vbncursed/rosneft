"use client";

import { useState } from "react";
import { useRolesAdmin } from "@/auth/application/use-roles-admin";
import CreateRoleForm from "@/auth/presentation/console/create-role-form";
import RoleDetail from "@/auth/presentation/console/role-detail";

export default function RolesPanel() {
  const { roles, permissions, loading, save, create, remove } = useRolesAdmin();
  const [sel, setSel] = useState<string | null>(null);
  const role = roles.find((r) => r.slug === sel) ?? null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Roles &amp; Permissions</h1>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-1">
          {loading ? <p className="text-sm text-neutral-500">Loading…</p> : roles.map((r) => (
            <button key={r.slug} type="button" onClick={() => setSel(r.slug)}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${sel === r.slug ? "border-cyan-400/60 bg-cyan-400/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/25"}`}>
              <span>{r.title}</span>
              {r.isSystem ? <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">system</span> : null}
            </button>
          ))}
          <CreateRoleForm permissions={permissions} onCreate={create} />
        </div>

        {role ? (
          <RoleDetail key={role.slug} role={role} permissions={permissions} onSave={save} onDelete={remove} />
        ) : (
          <p className="text-sm text-neutral-500">Select a role to edit its permissions.</p>
        )}
      </div>
    </div>
  );
}
