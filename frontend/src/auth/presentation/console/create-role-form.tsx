"use client";

import { useState } from "react";
import type { Permission } from "@/auth/domain/permission";

export default function CreateRoleForm({ onCreate }: { permissions: Permission[]; onCreate: (slug: string, title: string, perms: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 cursor-pointer rounded-md border border-dashed border-white/20 px-3 py-2 text-sm text-neutral-400 hover:text-cyan-200">+ New role</button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2">
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" className="rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-cyan-300/60" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-cyan-300/60" />
      <div className="flex gap-2">
        <button type="button" disabled={!slug || !title} onClick={() => { onCreate(slug, title, []); setOpen(false); setSlug(""); setTitle(""); }} className="flex-1 cursor-pointer rounded border border-white/30 bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-50">Create</button>
        <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded border border-white/15 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10">Cancel</button>
      </div>
    </div>
  );
}
