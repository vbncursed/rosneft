import { describe, expect, it, vi } from "vitest";

vi.mock("./admins-gateway", () => ({ getTerritoryAdmins: vi.fn(async () => ["u-1"]) }));
const { adminsQuery } = await import("./admins-query");
const { getTerritoryAdmins } = await import("./admins-gateway");

describe("adminsQuery", () => {
  it("keys by slug and delegates to the gateway", async () => {
    expect(adminsQuery("t-1").queryKey).toEqual(["territory-admins", "t-1"]);
    const run = adminsQuery("t-1").queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual(["u-1"]);
    expect(getTerritoryAdmins).toHaveBeenCalledWith("t-1");
  });
});
