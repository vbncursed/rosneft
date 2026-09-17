import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { markTourSeen } from "./tours-gateway";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

describe("tours gateway", () => {
  it("POSTs the tour id under the caller's own onboarding route", async () => {
    await expect(markTourSeen("viewer")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/me/onboarding/viewer");
    expect(init.method).toBe("POST");
  });

  it("escapes the id — it lands in a path segment, not a query", async () => {
    await markTourSeen("a/b");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me/onboarding/a%2Fb");
  });

  it("lets a refusal through, so the caller decides whether to care", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(markTourSeen("viewer")).rejects.toThrow();
  });
});
