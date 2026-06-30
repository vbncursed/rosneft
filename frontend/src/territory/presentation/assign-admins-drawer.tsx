"use client";

import { useEffect, useState } from "react";
import type { AdminUser } from "@/auth/domain/user";
import type { Role } from "@/auth/domain/role";
import { listUsers, listRoles } from "@/auth/infrastructure/auth-admin-gateway";
import { getTerritoryAdmins, setTerritoryAdmins } from "@/territory/infrastructure/territory-admins-gateway";
import { notify } from "@/shared/presentation/toast/use-toast";

// Roles that can be granted territory access: a Company Owner shares the
// territory with their whole team; a Guest sees only what they're assigned.
const ASSIGNABLE = ["Company Owner", "Guest"];

export default function AssignAdminsDrawer({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [roleOf, setRoleOf] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [users, roles, assigned] = await Promise.all([listUsers("", false), listRoles(), getTerritoryAdmins(slug)]);
        const titleOf = new Map(roles.filter((r: Role) => ASSIGNABLE.includes(r.title)).map((r) => [r.slug, r.title] as const));
        const list = users.filter((u) => u.roleSlugs.some((s) => titleOf.has(s)));
        setAdmins(list);
        setRoleOf(Object.fromEntries(list.map((u) => [u.id, u.roleSlugs.map((s) => titleOf.get(s)).find(Boolean) ?? ""])));
        setPicked(assigned);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function save() {
    setBusy(true);
    try {
      await setTerritoryAdmins(slug, picked);
      notify.success("Admins updated");
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">Grant access · {title}</p>
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-neutral-400">No Company Owners or Guests to assign yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {admins.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
                  picked.includes(u.id)
                    ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                    : "border-white/15 text-neutral-300 hover:bg-white/10"
                }`}
              >
                {u.username}
                {roleOf[u.id] ? <span className="ml-1.5 text-[10px] text-neutral-500">{roleOf[u.id]}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{picked.length} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || loading}
              className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
