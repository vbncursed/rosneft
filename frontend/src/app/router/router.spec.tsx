import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
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
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

function renderAt(path: string, principal: Principal = me) {
  const client = new QueryClient();
  client.setQueryData(meQuery.queryKey, principal);
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }), client);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
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

  describe("/two-factor-required", () => {
    const owing: Principal = { ...me, totpRequired: true, totpEnabled: false };

    it("draws the gate bare for a session that owes a second factor", async () => {
      renderAt("/two-factor-required", owing);
      expect(
        await screen.findByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("main")).toHaveLength(1);
    });

    // Unknown is not enrolled: sent home, a gateway 403 there would reload
    // back to the gate and loop.
    it("keeps a required session whose enrolment is unknown on the gate", async () => {
      renderAt("/two-factor-required", { ...me, totpRequired: true, totpEnabled: null });
      expect(
        await screen.findByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
      ).toBeInTheDocument();
    });

    it("sends a session without two-factor away from the done card", async () => {
      const router = renderAt("/two-factor-required?stage=done", { ...me, totpEnabled: false });
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    });

    it("sends an enrolled session home", async () => {
      const router = renderAt("/two-factor-required");
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    });

    // The gateway's cached requirement outlives /me's by up to 5 s; sent home,
    // this session would 403 and bounce straight back, again and again.
    it("keeps a session the client just bounced here on the gate", async () => {
      sessionStorage.setItem("andrey.enrollBounce", String(Date.now()));
      const router = renderAt("/two-factor-required", { ...me, totpEnabled: false });
      expect(
        await screen.findByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/two-factor-required");
    });

    it("keeps an enrolled session on the done card", async () => {
      renderAt("/two-factor-required?stage=done");
      expect(
        await screen.findByRole("heading", { level: 1, name: "You're all set" }),
      ).toBeInTheDocument();
    });

    // A session that owes a second factor can open nothing but the gate and the
    // wizard; everything else 403s at the gateway, so the router sends it on.
    it.each(["/", "/territories", "/console/users"])("confines it at %s", async (path) => {
      renderAt(path, owing);
      expect(
        await screen.findByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
      ).toBeInTheDocument();
    });

    it("lets it open the wizard", async () => {
      renderAt("/account/two-factor", owing);
      expect(await screen.findByRole("heading", { level: 1, name: "Enable two-factor" })).toBeInTheDocument();
    });

    it("sends a signed-out visitor to the login", async () => {
      clearAuthed();
      const router = renderAt("/two-factor-required");
      await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    });
  });
});
