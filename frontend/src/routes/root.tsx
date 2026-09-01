import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

// The context type has to be declared here, on the root route — every child's
// `context` is derived from it. A `declare module` augmentation cannot supply
// it: TanStack has no RouterContext augmentation point, so that silently left
// every loader seeing `{}`.
export const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // HeadContent emits whatever the matched routes' `head` returned. It renders
  // <title>/<meta> as ordinary elements; React 19 hoists them into <head>.
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
