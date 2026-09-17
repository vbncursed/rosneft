import { describe, expect, it, vi } from "vitest";
import type { Permission } from "../model/permission";
import { listPermissions } from "./permissions-gateway";
import { permissionsQuery } from "./permissions-query";

vi.mock("./permissions-gateway", () => ({ listPermissions: vi.fn() }));

const PERMISSIONS = [{ slug: "territory:read", description: "See territories" }] satisfies Permission[];

describe("permissionsQuery", () => {
  // The key is the contract: every reader of the permission catalog shares
  // one cache entry.
  it("is keyed so every reader shares one entry", () => {
    expect(permissionsQuery.queryKey).toEqual(["permissions"]);
  });

  it("fetches the catalog through the permissions gateway", async () => {
    vi.mocked(listPermissions).mockResolvedValue(PERMISSIONS);
    const run = permissionsQuery.queryFn as () => Promise<Permission[]>;
    await expect(run()).resolves.toBe(PERMISSIONS);
  });

  it("lets a rejection through rather than resolving to an empty list", async () => {
    vi.mocked(listPermissions).mockRejectedValue(new Error("401"));
    const run = permissionsQuery.queryFn as () => Promise<Permission[]>;
    await expect(run()).rejects.toThrow("401");
  });
});
