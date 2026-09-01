import { createRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { adminLayoutRoute } from "@/routes/admin";
import { requireConsolePermission } from "@/routes/guard";
import { listRoles } from "@/auth/infrastructure/auth-admin-gateway";
import UsersTable from "@/auth/presentation/console/users-table";
import { titleMeta } from "@/shared/presentation/page-title";

// Roles feed the assignment dropdowns; the users list itself loads inside
// UsersTable via useUsersAdmin. Mirrors the RSC page's server-side listRoles().
const rolesQuery = queryOptions({ queryKey: ["admin", "roles"], queryFn: listRoles });

function AdminUsers() {
  const { data: roles } = useSuspenseQuery(rolesQuery);
  return <UsersTable roles={roles} />;
}

export const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "users",
  head: () => titleMeta("Users · Admin"),
  // The console gate is an OR of users:read / roles:read, so this page needs
  // its own check — otherwise a roles-only user reaches it and the table just
  // 403s against the gateway.
  beforeLoad: ({ context, location }) =>
    requireConsolePermission(context.queryClient, location, "users:read"),
  loader: ({ context }) => context.queryClient.ensureQueryData(rolesQuery),
  component: AdminUsers,
});
