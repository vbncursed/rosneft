"use client";

import { useState } from "react";
import AssignAdminsDrawer from "@/territory/presentation/assign-admins-drawer";

export default function AssignAdminsButton({ slug, label }: { slug: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-md border border-white/20 px-2.5 py-1 text-xs text-neutral-200 transition-colors hover:bg-white/[0.08]"
      >
        Admins
      </button>
      {open ? <AssignAdminsDrawer slug={slug} title={label} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
