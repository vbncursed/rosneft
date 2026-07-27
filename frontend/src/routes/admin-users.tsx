import { createRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { adminLayoutRoute } from "@/routes/admin";
import { listRoles } from "@/auth/infrastructure/auth-admin-gateway";
import UsersTable from "@/auth/presentation/console/users-table";

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
  loader: ({ context }) => context.queryClient.ensureQueryData(rolesQuery),
  component: AdminUsers,
});
