"use client";

import type { AdminUser } from "@/auth/domain/user";
import type { Principal } from "@/auth/domain/principal";
import { can } from "@/auth/domain/principal";
import StatusBadge from "@/auth/presentation/console/status-badge";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";
import { freezeUser, unfreezeUser, deleteUser, restoreUser, setUserOwner } from "@/auth/infrastructure/auth-admin-gateway";

interface Props {
  u: AdminUser;
  me: Principal;
  roleTitle: (slug: string) => string;
  onEditRoles: (u: AdminUser) => void;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}

const ACTION = "cursor-pointer rounded-md border border-white/10 px-2.5 py-1 text-xs whitespace-nowrap transition-colors";
const NEUTRAL = "text-neutral-300 hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100";
const AMBER = "text-amber-200/90 hover:border-amber-300/40 hover:bg-amber-400/10";
const GREEN = "text-emerald-300/90 hover:border-emerald-300/40 hover:bg-emerald-400/10";
const RED = "text-red-300/90 hover:border-red-400/40 hover:bg-red-500/10";
const PILL = "whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]";

export default function UserRow({ u, me, roleTitle, onEditRoles, act }: Props) {
  const self = u.id === me.id;
  // Only the owner may freeze/delete an admin account (mirrors the backend guard).
  const canManage = me.isOwner || !u.roleSlugs.includes("admin");
  return (
    <tr className="border-t border-white/10 transition-colors hover:bg-white/[0.02]">
      <td className="px-3 py-2 text-sm text-white">{u.username}</td>
      <td className="px-3 py-2 text-sm text-neutral-300">{u.email}</td>
      <td className="px-3 py-2">
        <span className="flex flex-wrap gap-1">
          {u.isOwner ? <span className={`${PILL} border-amber-300/40 bg-amber-400/10 text-amber-200`}>Root</span> : null}
          {u.roleSlugs.map((r) => (
            <span key={r} className={`${PILL} border-white/15 text-neutral-300`}>{roleTitle(r)}</span>
          ))}
        </span>
      </td>
      <td className="px-3 py-2"><StatusBadge status={u.status} /></td>
      <td className="px-3 py-2">
        <span className={`${PILL} ${u.totpEnabled ? "border-emerald-300/40 text-emerald-300" : "border-red-400/40 text-red-300"}`}>
          {u.totpEnabled ? "Yes" : "No"}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-1.5">
          {can(me, "users:write") ? (
            <button type="button" onClick={() => onEditRoles(u)} className={`${ACTION} ${NEUTRAL}`}>Roles</button>
          ) : null}
          {me.isOwner && !self ? (
            u.isOwner ? (
              <button type="button"
                onClick={async () => { if (await confirmAction({ title: "Revoke Root", message: `Revoke Root from ${u.username}?`, danger: true, confirmLabel: "Revoke" })) void act(() => setUserOwner(u.id, false), "Root revoked"); }}
                className={`${ACTION} ${RED}`}>Revoke Root</button>
            ) : (
              <button type="button"
                onClick={async () => { if (await confirmAction({ title: "Make Root", message: `Grant Root to ${u.username}? Root has every permission and can manage everyone.`, confirmLabel: "Make Root" })) void act(() => setUserOwner(u.id, true), "Root granted"); }}
                className={`${ACTION} ${AMBER}`}>Make Root</button>
            )
          ) : null}
          {can(me, "users:freeze") && !self && canManage && u.status !== "deleted" ? (
            u.status === "frozen" ? (
              <button type="button" onClick={() => act(() => unfreezeUser(u.id), "Unfrozen")} className={`${ACTION} ${GREEN}`}>Unfreeze</button>
            ) : (
              <button type="button" onClick={() => act(() => freezeUser(u.id), "Frozen")} className={`${ACTION} ${AMBER}`}>Freeze</button>
            )
          ) : null}
          {can(me, "users:delete") && !self && canManage ? (
            u.status === "deleted" ? (
              <button type="button" onClick={() => act(() => restoreUser(u.id), "Restored")} className={`${ACTION} ${GREEN}`}>Restore</button>
            ) : (
              <button type="button"
                onClick={async () => { if (await confirmAction({ title: "Delete user", message: `Soft-delete ${u.username}?`, danger: true, confirmLabel: "Delete" })) void act(() => deleteUser(u.id), "Deleted"); }}
                className={`${ACTION} ${RED}`}>Delete</button>
            )
          ) : null}
        </div>
      </td>
    </tr>
  );
}
