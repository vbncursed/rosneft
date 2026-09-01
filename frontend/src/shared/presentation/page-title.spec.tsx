// Run with: yarn test:spa  (vitest + jsdom).
//
// The point of this test is not the string helper — it is the wiring. Titles
// only reach the tab if three things line up: the route's `head` returns
// `meta: [{ title }]`, `<HeadContent />` is mounted in the root route, and
// React 19 hoists the rendered <title> into <head>. Typechecking proves none of
// them, and the failure is silent: every tab just keeps saying "Andrey".
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createRouter,
  createRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { rootRoute } from "@/routes/root";
import { titleMeta } from "@/shared/presentation/page-title";

afterEach(cleanup);

function renderAt(path: string) {
  const parent = createRoute({
    getParentRoute: () => rootRoute,
    path: "/parent",
    head: () => titleMeta("Parent"),
    component: () => <div />,
  });
  const child = createRoute({
    getParentRoute: () => parent,
    path: "/child",
    head: () => titleMeta("Child"),
    component: () => <div />,
  });
  const plain = createRoute({
    getParentRoute: () => rootRoute,
    path: "/plain",
    component: () => <div />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([parent.addChildren([child]), plain]),
    history: createMemoryHistory({ initialEntries: [path] }),
    // rootRoute is createRootRouteWithContext, so a context is required even
    // though nothing in this test reads it.
    context: { queryClient: new QueryClient() },
  });
  // The tree here is local to the test and does not match the app's registered
  // route types, which is the whole point — it exercises HeadContent, not the
  // real routes.
  render(<RouterProvider router={router as never} />);
  return router;
}

describe("document title", () => {
  it("reaches document.head, so a tab is not just 'Andrey'", async () => {
    renderAt("/parent");
    await waitFor(() => expect(document.title).toBe("Parent · Andrey"));
  });

  it("lets the deepest matched route win over its layout", async () => {
    renderAt("/parent/child");
    await waitFor(() => expect(document.title).toBe("Child · Andrey"));
  });

  it("falls back to the bare site name when a route names no page", () => {
    expect(titleMeta().meta[0].title).toBe("Andrey");
    expect(titleMeta("Models").meta[0].title).toBe("Models · Andrey");
  });
});
