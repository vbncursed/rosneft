import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { beginRegistration, finishRegistration, listPasskeys, removePasskey } from "./passkey-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({})));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("passkey gateway", () => {
  it("maps a credential list, defaulting a never-used key to null", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ credentials: [{ id: "k1", name: "YubiKey 5C", createdAt: "2026-07-03T09:20:00Z" }] }),
    );
    expect(await listPasskeys()).toEqual([
      { id: "k1", name: "YubiKey 5C", createdAt: "2026-07-03T09:20:00Z", lastUsedAt: null },
    ]);
    expect(request()).toEqual({ url: "/api/auth/passkey/credentials", method: "GET", body: undefined });
  });

  it("reads an empty list when the server sends no credentials key", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await listPasskeys()).toEqual([]);
    expect(request()).toEqual({ url: "/api/auth/passkey/credentials", method: "GET", body: undefined });
  });

  it("encodes the id into the delete path and sends only the factor given", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await removePasskey("a/b", { code: "402913" });
    expect(request()).toEqual({
      url: "/api/auth/passkey/credentials/a%2Fb",
      method: "DELETE",
      body: { code: "402913" },
    });
  });

  it("begins registration and defaults missing fields to empty strings", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await beginRegistration()).toEqual({ optionsJson: "", flowId: "" });
    expect(request()).toEqual({
      url: "/api/auth/passkey/register/begin",
      method: "POST",
      body: undefined,
    });
  });

  it("finishes registration by posting the flow, the credential and the chosen name", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ id: "k2", name: "iPhone 15", createdAt: "2026-09-07T18:02:00Z", lastUsedAt: "2026-09-07T18:02:00Z" }),
    );
    const out = await finishRegistration("flow-1", '{"id":"cred"}', "iPhone 15");
    expect(out).toEqual({
      id: "k2",
      name: "iPhone 15",
      createdAt: "2026-09-07T18:02:00Z",
      lastUsedAt: "2026-09-07T18:02:00Z",
    });
    expect(request()).toEqual({
      url: "/api/auth/passkey/register/finish",
      method: "POST",
      body: { flowId: "flow-1", credentialJson: '{"id":"cred"}', name: "iPhone 15" },
    });
  });
});
