"use client";

import { useMemo, useState } from "react";
import type { Permission } from "@/auth/domain/permission";
import PermissionMatrix from "@/auth/presentation/console/permission-matrix";
import { useCurrentUser } from "@/auth/presentation/current-user-context";
import MotionModal from "@/shared/presentation/motion/motion-modal";

export default function CreateRoleForm({ permissions, onCreate }: {
  permissions: Permission[];
  onCreate: (title: string, perms: string[]) => void;
}) {
  const me = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  // Permissions the actor may grant: its own, or everything if it's the owner.
  const grantable = useMemo(() => (me?.isOwner ? undefined : new Set(me?.permissions ?? [])), [me]);
  const toggle = (s: string) => setPerms((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  function close() {
    setOpen(false);
    setTitle("");
    setPerms([]);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 cursor-pointer rounded-md border border-dashed border-white/20 px-3 py-2 text-sm text-neutral-400 hover:text-cyan-200">+ New role</button>
    );
  }

  return (
    <MotionModal open onClose={close} className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-white/15 bg-[#0c0d10]/95 p-6">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">New role</p>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-neutral-400">
          Role name
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Surveyor" autoFocus
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-300/60" />
        </label>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Permissions</p>
          <div className="mt-2"><PermissionMatrix all={permissions} selected={perms} onToggle={toggle} grantable={grantable} /></div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={close} className="cursor-pointer rounded-md border border-white/20 px-4 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.06]">Cancel</button>
          <button type="button" disabled={!title.trim()} onClick={() => { onCreate(title.trim(), perms); close(); }}
            className="cursor-pointer rounded-md border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">Create role</button>
        </div>
    </MotionModal>
  );
}
