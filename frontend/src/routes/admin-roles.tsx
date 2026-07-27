import { createRoute } from "@tanstack/react-router";
import { adminLayoutRoute } from "@/routes/admin";
import RolesPanel from "@/auth/presentation/console/roles-panel";

// RolesPanel is self-contained: useRolesAdmin loads roles + permissions itself.
export const adminRolesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "roles",
  component: RolesPanel,
});
