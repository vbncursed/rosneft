import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetSize, assetUrl } from "./assets";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("assets", () => {
  it("addresses a blob by hash", () => {
    expect(assetUrl("abc")).toBe("/api/assets/abc");
  });

  it("reads a blob's size off a HEAD", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200, headers: { "Content-Length": "2048" } }));
    await expect(assetSize("abc")).resolves.toBe(2048);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("HEAD");
  });

  it("answers null when the header is missing or the request fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(assetSize("abc")).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(assetSize("abc")).resolves.toBeNull();
  });
});
