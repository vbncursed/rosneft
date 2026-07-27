import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "@/routes/root";
import { loginRoute, indexRoute } from "@/routes/login";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
