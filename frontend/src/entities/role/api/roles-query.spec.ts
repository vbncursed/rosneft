import { describe, expect, it, vi } from "vitest";
import type { Role } from "../model/role";
import { listRoles } from "./roles-gateway";
import { rolesQuery } from "./roles-query";

vi.mock("./roles-gateway", () => ({ listRoles: vi.fn() }));

const ROLES = [
  {
    slug: "field-operator",
    title: "Field Operator",
    kind: "custom",
    permissionSlugs: ["territory:read"],
    grants: 1,
    users: null,
    updated: "",
  },
] satisfies Role[];

describe("rolesQuery", () => {
  // The key is the contract: every mutation that invalidates ["roles"] must
  // hit the same cache entry every reader shares.
  it("is keyed so every reader shares one entry", () => {
    expect(rolesQuery.queryKey).toEqual(["roles"]);
  });

  it("fetches the list through the roles gateway", async () => {
    vi.mocked(listRoles).mockResolvedValue(ROLES);
    const run = rolesQuery.queryFn as () => Promise<Role[]>;
    await expect(run()).resolves.toBe(ROLES);
  });

  it("lets a rejection through rather than resolving to an empty list", async () => {
    vi.mocked(listRoles).mockRejectedValue(new Error("401"));
    const run = rolesQuery.queryFn as () => Promise<Role[]>;
    await expect(run()).rejects.toThrow("401");
  });
});
