import { createRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { adminLayoutRoute } from "@/routes/admin";
import { requireAuth } from "@/routes/guard";
import { meQuery } from "@/auth/application/me-query";
import { territoriesQuery } from "@/territory/application/territories-query";
import TerritoryAccessTable from "@/territory/presentation/territory-access-table";

function AdminTerritories() {
  const { data: territories } = useSuspenseQuery(territoriesQuery);
  return <TerritoryAccessTable territories={territories} />;
}

// Owner-only: assigning territories to admins is an owner action (mirrors the RSC).
export const adminTerritoriesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "territories",
  beforeLoad: async ({ context, location }) => {
    requireAuth(location.pathname);
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me.isOwner) throw redirect({ to: "/admin/users" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(territoriesQuery),
  component: AdminTerritories,
});
