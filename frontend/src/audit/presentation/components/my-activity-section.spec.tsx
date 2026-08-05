// Run with: yarn test:spa  (vitest + jsdom).
//
// cleanup is wired by hand: vitest runs without `globals`, so testing-library
// cannot register its own afterEach hook.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

const useCurrentUser = vi.fn();
vi.mock("@/auth/presentation/current-user-context", () => ({
  useCurrentUser: () => useCurrentUser(),
}));

const useAuditLog = vi.fn();
vi.mock("@/audit/application/use-audit-log", () => ({
  useAuditLog: (f: unknown, fetchPage: unknown, scope: unknown) =>
    useAuditLog(f, fetchPage, scope),
}));

// Imported so the assertion below compares against the real function, not a
// name: renaming the export must break the test rather than pass it silently.
import { fetchMyAuditPage } from "@/audit/infrastructure/audit-gateway";

import MyActivitySection from "./my-activity-section";

const principal = (permissions: string[], isOwner = false) => ({
  id: "user-7",
  email: "a@b.c",
  username: "vbncursed",
  status: "active" as const,
  totpEnabled: false,
  passkeyEnabled: null,
  roleSlugs: [],
  permissions,
  isOwner,
  onboardingToursSeen: [],
});

const log = (over = {}) => ({
  entries: [],
  refs: {},
  isLoading: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(),
  isLoadingMore: false,
  ...over,
});

const entry = {
  id: 1,
  at: "2026-07-29T10:00:00Z",
  actorId: "user-7",
  actorLogin: "vbncursed",
  companyId: "c1",
  companyLogin: "owner",
  action: "placement.update",
  entity: "placement",
  entityId: "3",
  entityLabel: "pump-101",
  oldRow: null,
  newRow: { label: "pump-101" },
  territorySlug: "",
  result: "ok",
};

afterEach(() => {
  cleanup();
  useCurrentUser.mockReset();
  useAuditLog.mockReset();
});

describe("MyActivitySection", () => {
  it("stays hidden for a principal with no journal grant", () => {
    useCurrentUser.mockReturnValue(principal(["territory:read"]));
    useAuditLog.mockReturnValue(log());

    const { container } = render(<MyActivitySection />);

    expect(container.textContent).toBe("");
  });

  it("renders for a principal holding audit:read_own", () => {
    useCurrentUser.mockReturnValue(principal(["audit:read_own"]));
    useAuditLog.mockReturnValue(log({ entries: [entry] }));

    render(<MyActivitySection />);

    expect(screen.getByText("placement.update")).toBeTruthy();
  });

  it("renders for a Company Owner, whose audit:read is wider", () => {
    useCurrentUser.mockReturnValue(principal(["audit:read"]));
    useAuditLog.mockReturnValue(log());

    render(<MyActivitySection />);

    expect(screen.getByText(/My activity/i)).toBeTruthy();
  });

  // The bug this section shipped with: it read the company journal and trusted
  // the gateway to narrow the result. For a Company Owner — audit:read as well
  // as audit:read_own — the gateway did not narrow it, and "My activity" listed
  // everyone. The endpoint is the boundary, so it is what gets asserted.
  it("reads the own-journal, not the company journal", () => {
    useCurrentUser.mockReturnValue(principal(["audit:read", "audit:read_own"]));
    useAuditLog.mockReturnValue(log());

    render(<MyActivitySection />);

    expect(useAuditLog).toHaveBeenCalledWith(expect.anything(), fetchMyAuditPage, "mine");
  });

  // An empty history and a failed load look identical if the error is dropped,
  // and "nothing recorded" is a far more reassuring lie than it deserves to be.
  it("surfaces a load failure instead of showing an empty history", () => {
    useCurrentUser.mockReturnValue(principal(["audit:read_own"]));
    useAuditLog.mockReturnValue(log({ error: new Error("gateway is down") }));

    render(<MyActivitySection />);

    expect(screen.getByText(/gateway is down/i)).toBeTruthy();
  });
});
