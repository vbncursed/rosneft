"use client";

import type { AdminUser } from "@/auth/domain/user";
import type { Principal } from "@/auth/domain/principal";
import { can } from "@/auth/domain/principal";
import StatusBadge from "@/auth/presentation/console/status-badge";
import RowActionsMenu, { type ActionItem } from "@/auth/presentation/console/row-actions-menu";
import { confirmAction } from "@/shared/presentation/confirm/use-confirm";
import { freezeUser, unfreezeUser, deleteUser, restoreUser, setUserOwner } from "@/auth/infrastructure/auth-admin-gateway";

interface Props {
  u: AdminUser;
  me: Principal;
  roleTitle: (slug: string) => string;
  onEditRoles: (u: AdminUser) => void;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}

// Trailing letter-spacing (tracking) only adds room after the last glyph; the
// matching text-indent balances it so short labels like "NO" aren't right-heavy.
const PILL = "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] [text-indent:0.18em]";

export default function UserRow({ u, me, roleTitle, onEditRoles, act }: Props) {
  const self = u.id === me.id;
  // Only the owner may freeze/delete an admin account (mirrors the backend guard).
  const canManage = me.isOwner || !u.roleSlugs.includes("admin");

  const items: ActionItem[] = [];
  if (can(me, "users:write")) items.push({ label: "Edit roles", onClick: () => onEditRoles(u) });
  if (me.isOwner && !self) {
    items.push(u.isOwner
      ? { label: "Revoke Root", tone: "red", onClick: async () => { if (await confirmAction({ title: "Revoke Root", message: `Revoke Root from ${u.username}?`, danger: true, confirmLabel: "Revoke" })) void act(() => setUserOwner(u.id, false), "Root revoked"); } }
      : { label: "Make Root", tone: "amber", onClick: async () => { if (await confirmAction({ title: "Make Root", message: `Grant Root to ${u.username}? Root has every permission and can manage everyone.`, confirmLabel: "Make Root" })) void act(() => setUserOwner(u.id, true), "Root granted"); } });
  }
  if (can(me, "users:freeze") && !self && canManage && u.status !== "deleted") {
    items.push(u.status === "frozen"
      ? { label: "Unfreeze", tone: "green", onClick: () => act(() => unfreezeUser(u.id), "Unfrozen") }
      : { label: "Freeze", tone: "amber", onClick: () => act(() => freezeUser(u.id), "Frozen") });
  }
  if (can(me, "users:delete") && !self && canManage) {
    items.push(u.status === "deleted"
      ? { label: "Restore", tone: "green", onClick: () => act(() => restoreUser(u.id), "Restored") }
      : { label: "Delete", tone: "red", onClick: async () => { if (await confirmAction({ title: "Delete user", message: `Soft-delete ${u.username}?`, danger: true, confirmLabel: "Delete" })) void act(() => deleteUser(u.id), "Deleted"); } });
  }

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
      <td className="px-3 py-2 text-right"><RowActionsMenu items={items} ariaLabel={`Actions for ${u.username}`} /></td>
    </tr>
  );
}
