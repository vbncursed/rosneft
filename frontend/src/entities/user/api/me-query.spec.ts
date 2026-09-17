import { describe, expect, it, vi } from "vitest";
import type { Principal } from "@/shared/session";
import { getMe } from "./auth-gateway";
import { meQuery } from "./me-query";

vi.mock("./auth-gateway", () => ({ getMe: vi.fn() }));

const PRINCIPAL = {
  id: "u-1",
  email: "a.ivanova@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: ["admin"],
  roleTitles: { admin: "Company Owner" },
  permissions: ["users:read"],
  isOwner: false,
  onboardingToursSeen: [],
} satisfies Principal;

describe("meQuery", () => {
  // The key is the contract: two readers with different keys are two fetches
  // and, worse, two answers that can disagree.
  it("is keyed so every reader shares one entry", () => {
    expect(meQuery.queryKey).toEqual(["me"]);
  });

  it("fetches the principal through the auth gateway", async () => {
    vi.mocked(getMe).mockResolvedValue(PRINCIPAL);
    const run = meQuery.queryFn as () => Promise<Principal>;
    await expect(run()).resolves.toBe(PRINCIPAL);
  });

  // A 401 must propagate: it is what client.ts turns into the bounce to
  // /login. Swallowing it here would seat a revoked session in the console.
  it("lets a rejection through rather than resolving to null", async () => {
    vi.mocked(getMe).mockRejectedValue(new Error("401"));
    const run = meQuery.queryFn as () => Promise<Principal>;
    await expect(run()).rejects.toThrow("401");
  });
});
