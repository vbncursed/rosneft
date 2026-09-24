import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/shared/session";
import { meQuery } from "@/entities/user";
import { TwoFactorRequiredScreen } from "./two-factor-required-screen";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/features/sign-out", () => ({ useSignOut: () => ({ signOut, pending: false }) }));

const principal = (totpEnabled: boolean | null) =>
  ({ username: "enroll1", totpRequired: true, totpEnabled }) as Principal;

// The screen reads the principal the route's beforeLoad already put in the cache.
function renderWith(me: Principal) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(meQuery.queryKey, me);
  return render(
    <QueryClientProvider client={client}>
      <TwoFactorRequiredScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => signOut.mockReset());

describe("TwoFactorRequiredScreen", () => {
  it("shows the gate while enrolment is owed", () => {
    renderWith(principal(false));
    expect(
      screen.getByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
    ).toBeInTheDocument();
    expect(screen.getByText("enroll1")).toBeInTheDocument();
  });

  it("shows the gate while enrolment is unknown", () => {
    renderWith(principal(null));
    expect(
      screen.getByRole("heading", { level: 1, name: "Set up two-factor to continue" }),
    ).toBeInTheDocument();
  });

  it("shows the done card once two-factor is on", () => {
    renderWith(principal(true));
    expect(screen.getByRole("heading", { level: 1, name: "You're all set" })).toBeInTheDocument();
  });

  it("signs out through the feature", async () => {
    renderWith(principal(false));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });
});
