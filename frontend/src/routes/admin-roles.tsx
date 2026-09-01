import { createRoute } from "@tanstack/react-router";
import { adminLayoutRoute } from "@/routes/admin";
import { requireConsolePermission } from "@/routes/guard";
import RolesPanel from "@/auth/presentation/console/roles-panel";
import { titleMeta } from "@/shared/presentation/page-title";

// RolesPanel is self-contained: useRolesAdmin loads roles + permissions itself.
export const adminRolesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "roles",
  head: () => titleMeta("Roles · Admin"),
  beforeLoad: ({ context, location }) =>
    requireConsolePermission(context.queryClient, location, "roles:read"),
  component: RolesPanel,
});
