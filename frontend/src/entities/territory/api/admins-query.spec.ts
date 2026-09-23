import { describe, expect, it, vi } from "vitest";

vi.mock("./admins-gateway", () => ({ listTerritoryAdmins: vi.fn(async () => ({ "t-1": ["u-1"] })) }));
const { territoryAdminsQuery } = await import("./admins-query");

describe("territoryAdminsQuery", () => {
  it("is one cache entry for every territory and delegates to the gateway", async () => {
    expect(territoryAdminsQuery.queryKey).toEqual(["territory-admins"]);
    const run = territoryAdminsQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual({ "t-1": ["u-1"] });
  });
});
