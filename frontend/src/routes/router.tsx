import { createRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { rootRoute } from "@/routes/root";
import { loginRoute } from "@/routes/login";
import { authedLayoutRoute } from "@/routes/layout";
import { homeRoute } from "@/routes/home";
import { queryClient } from "@/shared/infrastructure/query/query-client";

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayoutRoute.addChildren([homeRoute]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface RouterContext {
    queryClient: QueryClient;
  }
}
