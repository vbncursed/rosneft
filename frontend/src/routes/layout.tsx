import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "@/routes/root";
import { requireAuth } from "@/routes/guard";
import AppLayout from "@/app-shell/app-layout";

// Pathless (id-only) parent for every authenticated route. Its beforeLoad gates
// the whole subtree; AppLayout renders the shared chrome around <Outlet/>.
export const authedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: AppLayout,
});
