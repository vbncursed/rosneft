"use client";

import { useMemo } from "react";
import type { Permission } from "@/auth/domain/permission";

export default function PermissionMatrix({ all, selected, onToggle, disabled, grantable }: {
  all: Permission[]; selected: string[]; onToggle: (slug: string) => void; disabled?: boolean;
  // When set, permissions outside it are locked (the actor cannot grant them).
  grantable?: Set<string>;
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
              const locked = grantable ? !grantable.has(p.slug) : false;
              return (
                <button key={p.slug} type="button" disabled={disabled || locked} onClick={() => onToggle(p.slug)}
                  title={locked ? "You cannot grant a permission you do not have" : p.description}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${locked ? "cursor-not-allowed" : "cursor-pointer"} ${on ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-white/15 text-neutral-300 hover:bg-white/10"}`}>
                  {p.slug.split(":")[1] ?? p.slug}{locked ? " 🔒" : ""}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
