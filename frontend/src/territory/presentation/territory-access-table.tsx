"use client";

import { useState } from "react";
import AssignAdminsDrawer from "@/territory/presentation/assign-admins-drawer";

interface TerritoryItem {
  slug: string;
  title: string;
}

export default function TerritoryAccessTable({ territories }: { territories: TerritoryItem[] }) {
  const [selected, setSelected] = useState<TerritoryItem | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Territory access</h1>
      <p className="text-xs text-neutral-400">
        Grant access per territory. Company owners share it with their whole team; guests see only what you assign them.
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            <tr>
              <th className="px-3 py-2">Territory</th>
              <th className="px-3 py-2">Slug</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {territories.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-neutral-500">
                  No territories.
                </td>
              </tr>
            ) : (
              territories.map((t) => (
                <tr key={t.slug} className="border-t border-white/5">
                  <td className="px-3 py-3 text-sm text-neutral-100">{t.title}</td>
                  <td className="px-3 py-3 text-sm text-neutral-400">{t.slug}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-xs text-neutral-200 transition-colors hover:bg-white/10"
                    >
                      Manage access
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <AssignAdminsDrawer slug={selected.slug} title={selected.title} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
