import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/application/current-user";
import { can } from "@/auth/domain/principal";
import { listTerritories } from "@/territory/infrastructure/territory-gateway";
import { listModels } from "@/model/infrastructure/model-gateway";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const p = await getCurrentUser();
  if (!p || !(can(p, "territory:write") || can(p, "model:write"))) redirect("/admin/users");
  const [territories, models] = await Promise.all([listTerritories(), listModels()]);
  const cards = [
    { href: "/territories", label: "Territories", count: territories.length, hint: "Upload, delete, place objects" },
    { href: "/models", label: "Models", count: models.length, hint: "Upload & delete placeable assets" },
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <p className="text-xs text-neutral-400">Manage the 3D catalog (admin-only).</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/30 hover:bg-white/[0.06]">
            <p className="text-3xl font-semibold tracking-tight text-white">{c.count}</p>
            <p className="mt-1 text-sm font-medium text-neutral-200">{c.label}</p>
            <p className="mt-3 text-xs text-neutral-400">{c.hint}</p>
            <span className="mt-4 inline-block text-xs uppercase tracking-[0.2em] text-cyan-300/80 transition group-hover:translate-x-1">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
