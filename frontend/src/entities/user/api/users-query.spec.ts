import { describe, expect, it, vi } from "vitest";
import type { User } from "../model/user";
import { listUsers } from "./users-gateway";
import { usersQuery } from "./users-query";

vi.mock("./users-gateway", () => ({ listUsers: vi.fn() }));

const USERS = [
  {
    id: "u-1",
    email: "a@example.com",
    username: "a.ivanova",
    status: "active",
    totpEnabled: null,
    passkeyEnabled: null,
    totpRequired: false,
    roleSlugs: [],
    roleTitles: {},
    isOwner: false,
  },
] satisfies User[];

describe("usersQuery", () => {
  // The key is the contract: every mutation that invalidates ["users"] must
  // hit the same cache entry every reader shares.
  it("is keyed so every reader shares one entry", () => {
    expect(usersQuery.queryKey).toEqual(["users"]);
  });

  it("fetches the list through the users gateway", async () => {
    vi.mocked(listUsers).mockResolvedValue(USERS);
    const run = usersQuery.queryFn as () => Promise<User[]>;
    await expect(run()).resolves.toBe(USERS);
  });

  it("lets a rejection through rather than resolving to an empty list", async () => {
    vi.mocked(listUsers).mockRejectedValue(new Error("401"));
    const run = usersQuery.queryFn as () => Promise<User[]>;
    await expect(run()).rejects.toThrow("401");
  });
});
