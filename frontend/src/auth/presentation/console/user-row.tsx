"use client";

import type { AdminUser } from "@/auth/domain/user";
import type { Principal } from "@/auth/domain/principal";
import { can } from "@/auth/domain/principal";
import StatusBadge from "@/auth/presentation/console/status-badge";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";
import { freezeUser, unfreezeUser, deleteUser, restoreUser } from "@/auth/infrastructure/auth-admin-gateway";

interface Props {
  u: AdminUser;
  me: Principal;
  onEditRoles: (u: AdminUser) => void;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}

export default function UserRow({ u, me, onEditRoles, act }: Props) {
  const self = u.id === me.id;
  return (
    <tr className="border-t border-white/10">
      <td className="px-3 py-2 text-sm text-white">{u.username}</td>
      <td className="px-3 py-2 text-sm text-neutral-300">{u.email}</td>
      <td className="px-3 py-2">
        <span className="flex flex-wrap gap-1">
          {u.roleSlugs.map((r) => (
            <span key={r} className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300">{r}</span>
          ))}
        </span>
      </td>
      <td className="px-3 py-2"><StatusBadge status={u.status} /></td>
      <td className="px-3 py-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${u.totpEnabled ? "border-emerald-300/40 text-emerald-300" : "border-red-400/40 text-red-300"}`}>
          {u.totpEnabled ? "Yes" : "No"}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-2 text-xs">
          {can(me, "users:write") ? (
            <button type="button" onClick={() => onEditRoles(u)} className="cursor-pointer text-neutral-300 hover:text-cyan-300">Roles</button>
          ) : null}
          {can(me, "users:freeze") && !self && u.status !== "deleted" ? (
            u.status === "frozen" ? (
              <button type="button" onClick={() => act(() => unfreezeUser(u.id), "Unfrozen")} className="cursor-pointer text-neutral-300 hover:text-emerald-300">Unfreeze</button>
            ) : (
              <button type="button" onClick={() => act(() => freezeUser(u.id), "Frozen")} className="cursor-pointer text-neutral-300 hover:text-amber-300">Freeze</button>
            )
          ) : null}
          {can(me, "users:delete") && !self ? (
            u.status === "deleted" ? (
              <button type="button" onClick={() => act(() => restoreUser(u.id), "Restored")} className="cursor-pointer text-neutral-300 hover:text-emerald-300">Restore</button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (await confirmAction({ title: "Delete user", message: `Soft-delete ${u.username}?`, danger: true, confirmLabel: "Delete" })) {
                    void act(() => deleteUser(u.id), "Deleted");
                  }
                }}
                className="cursor-pointer text-neutral-300 hover:text-red-400"
              >
                Delete
              </button>
            )
          ) : null}
        </div>
      </td>
    </tr>
  );
}
