import { createRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminLayoutRoute } from "@/routes/admin";
import { requireAuth, consoleLanding } from "@/routes/guard";
import { meQuery } from "@/auth/application/me-query";
import { can } from "@/auth/domain/principal";
import { territoriesQuery } from "@/territory/application/territories-query";
import { modelsQuery } from "@/model/application/models-query";
import { titleMeta } from "@/shared/presentation/page-title";

const card =
  "group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/30 hover:bg-white/[0.06]";

function AdminContent() {
  const { data: territories = [] } = useQuery(territoriesQuery);
  const { data: models = [] } = useQuery(modelsQuery);
  const cards = [
    { to: "/territories", label: "Territories", count: territories.length, hint: "Upload, delete, place objects" },
    { to: "/models", label: "Models", count: models.length, hint: "Upload & delete placeable assets" },
  ] as const;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <p className="text-xs text-neutral-400">Manage the 3D catalog (admin-only).</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className={card}>
            <p className="text-3xl font-semibold tracking-tight text-white">{c.count}</p>
            <p className="mt-1 text-sm font-medium text-neutral-200">{c.label}</p>
            <p className="mt-3 text-xs text-neutral-400">{c.hint}</p>
            <span className="mt-4 inline-block text-xs uppercase tracking-[0.2em] text-cyan-300/80 transition group-hover:translate-x-1">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export const adminContentRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "content",
  head: () => titleMeta("Content · Admin"),
  beforeLoad: async ({ context, location }) => {
    requireAuth(location);
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!(can(me, "territory:write") || can(me, "model:write"))) throw redirect({ to: consoleLanding(me) });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(territoriesQuery),
      context.queryClient.ensureQueryData(modelsQuery),
    ]),
  component: AdminContent,
});
