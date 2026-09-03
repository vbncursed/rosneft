import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  createUser,
  deleteUser,
  freezeUser,
  listUsers,
  setTwoFactorRequired,
  setUserRoles,
} from "./users-gateway";

const user = { id: "u-1", email: "a@x", username: "a", status: "active", roleSlugs: [], permissions: [], isOwner: false, totpRequired: false };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // A factory, not mockResolvedValue: a real Response body can be read only
  // once, and this default answers more than one call per test.
  fetchMock = vi.fn(() => Promise.resolve(json(user)));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("users gateway", () => {
  // Deleted accounts stay visible: the card dims them and status: narrows.
  it("lists everyone, deleted included, as domain users", async () => {
    fetchMock.mockResolvedValueOnce(json([user]));
    const users = await listUsers();
    expect(request().url).toBe("/api/auth/users?includeDeleted=true");
    expect(users[0].totpEnabled).toBeNull();
  });

  it("creates with the whole input and replaces roles with a PATCH", async () => {
    await createUser({ email: "b@x", username: "b", password: "pw", roleSlugs: ["guest"] });
    expect(request()).toEqual({ url: "/api/auth/users", method: "POST", body: { email: "b@x", username: "b", password: "pw", roleSlugs: ["guest"] } });

    await setUserRoles("u 1", ["admin"]);
    expect(request(1)).toEqual({ url: "/api/auth/users/u%201", method: "PATCH", body: { roleSlugs: ["admin"] } });
  });

  it("posts the state changes to their own routes", async () => {
    await freezeUser("u-1");
    await setTwoFactorRequired("u-1", true);
    await setTwoFactorRequired("u-1", false);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteUser("u-1");
    expect(fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      "POST /api/auth/users/u-1/freeze",
      "POST /api/auth/users/u-1/2fa/require",
      "POST /api/auth/users/u-1/2fa/unrequire",
      "DELETE /api/auth/users/u-1",
    ]);
  });
});
