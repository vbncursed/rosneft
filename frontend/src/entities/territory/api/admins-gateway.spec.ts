import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { listTerritoryAdmins, setTerritoryAdmins } from "./admins-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({ userIds: ["u-1", "u-2"] })));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("territory admins gateway", () => {
  it("reads every territory's admin set in one call, defending against the gateway's null for none", async () => {
    fetchMock.mockResolvedValueOnce(json({ "t-1": ["u-1", "u-2"], "t-2": null }));
    await expect(listTerritoryAdmins()).resolves.toEqual({ "t-1": ["u-1", "u-2"], "t-2": [] });
    expect(request()).toEqual({ url: "/api/territory-admins", method: "GET", body: undefined });
  });

  it("replaces the whole set with a PUT and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(setTerritoryAdmins("t-1", ["u-9"])).resolves.toBeUndefined();
    expect(request()).toEqual({ url: "/api/territories/t-1/admins", method: "PUT", body: { userIds: ["u-9"] } });
  });
});
