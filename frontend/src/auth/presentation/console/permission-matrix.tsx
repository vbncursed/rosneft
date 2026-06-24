"use client";

import { useMemo } from "react";
import type { Permission } from "@/auth/domain/permission";

export default function PermissionMatrix({ all, selected, onToggle, disabled }: {
  all: Permission[]; selected: string[]; onToggle: (slug: string) => void; disabled?: boolean;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of all) {
      const g = p.slug.split(":")[0];
      const arr = m.get(g) ?? [];
      arr.push(p);
      m.set(g, arr);
    }
    return [...m.entries()];
  }, [all]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([group, perms]) => (
        <div key={group}>
          <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{group}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {perms.map((p) => {
              const on = selected.includes(p.slug);
              return (
                <button key={p.slug} type="button" disabled={disabled} onClick={() => onToggle(p.slug)} title={p.description}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${on ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/15 text-neutral-300 hover:bg-white/10"}`}>
                  {p.slug.split(":")[1] ?? p.slug}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
