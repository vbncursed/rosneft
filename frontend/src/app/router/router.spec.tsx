import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meQuery } from "@/entities/user";
import { clearAuthed, markAuthed, type Principal } from "@/shared/session";
import { createAppRouter } from "./router";

const me: Principal = {
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: true,
  onboardingToursSeen: [],
};

// Signed in, principal cached: both shells would render if the 404 landed in
// their outlet. Every other request hangs, so no screen's query can fail.
beforeEach(() => {
  markAuthed();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => {
  clearAuthed();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const client = new QueryClient();
  client.setQueryData(meQuery.queryKey, me);
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }), client);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("router", () => {
  // The 404 draws its own page chrome; inside a shell's <main> it would nest a
  // second <main>, brand and theme toggle.
  it.each(["/console/nope", "/territories/a/b"])("renders the 404 bare at %s", async (path) => {
    renderAt(path);
    expect(
      await screen.findByRole("heading", { level: 1, name: "This page doesn't exist" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { level: 1 }));
  });
});
