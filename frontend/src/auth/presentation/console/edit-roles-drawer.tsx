"use client";

import { useMemo, useState } from "react";
import type { AdminUser } from "@/auth/domain/user";
import type { Role } from "@/auth/domain/role";
import { canGrant } from "@/auth/domain/principal";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import { updateUserRoles } from "@/auth/infrastructure/auth-admin-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";

export default function EditRolesDrawer({ user, roles, onClose, onSaved }: { user: AdminUser; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const me = useCurrentUser();
  // Roles whose permissions the actor cannot grant are shown but locked.
  const grantable = useMemo(() => new Set(roles.filter((r) => canGrant(me, r.permissionSlugs)).map((r) => r.slug)), [roles, me]);
  const [picked, setPicked] = useState<string[]>(user.roleSlugs);
  const [busy, setBusy] = useState(false);
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  // Block save if the result would keep a role the actor can't grant — the
  // backend would reject it anyway.
  const blocked = picked.some((s) => !grantable.has(s));

  async function save() {
    setBusy(true);
    try {
      await updateUserRoles(user.id, picked);
      notify.success("Roles updated");
      onSaved();
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Roles · {user.username}</p>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const locked = !grantable.has(r.slug);
            return (
              <button key={r.slug} type="button" disabled={locked} onClick={() => toggle(r.slug)}
                title={locked ? "Requires owner privileges to assign" : undefined}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${locked ? "cursor-not-allowed border-white/10 text-neutral-600" : "cursor-pointer"} ${picked.includes(r.slug) ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : !locked ? "border-white/15 text-neutral-300 hover:bg-white/10" : ""}`}>
                {r.slug}{locked ? " 🔒" : ""}
              </button>
            );
          })}
        </div>
        {blocked ? <p className="text-xs text-amber-300/80">This user holds a role only an owner can manage.</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06]">Cancel</button>
          <button type="button" onClick={save} disabled={busy || blocked} className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
