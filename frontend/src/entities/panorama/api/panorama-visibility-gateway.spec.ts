import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  setPanoramaPhaseHidden,
  setPanoramasHidden,
  setPanoramasPhase,
  toPhaseHidden,
} from "./panorama-visibility-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({ updated: 2 })));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return {
    url,
    method: init.method ?? "GET",
    body: init.body ? JSON.parse(init.body as string) : undefined,
    csrf: (init.headers as Record<string, string>)["X-CSRF-Token"],
  };
};

describe("panorama visibility gateway", () => {
  // A cookie session's mutation needs the header, or the gateway refuses it.
  it("PUTs a bulk hide with the CSRF header, and resolves to how many rows changed", async () => {
    await expect(setPanoramasHidden("north", [4, 5], true)).resolves.toBe(2);
    expect(request()).toEqual({
      url: "/api/territories/north/panoramas/hidden",
      method: "PUT",
      body: { ids: [4, 5], hidden: true },
      csrf: "csrf",
    });
  });

  it("PUTs a move to the phase route", async () => {
    fetchMock.mockResolvedValueOnce(json({ updated: 1 }));
    await expect(setPanoramasPhase("north", [4], "post")).resolves.toBe(1);
    expect(request()).toEqual({
      url: "/api/territories/north/panoramas/phase",
      method: "PUT",
      body: { ids: [4], phase: "post" },
      csrf: "csrf",
    });
  });

  it("PUTs a phase's own flag and resolves to the flag as stored", async () => {
    fetchMock.mockResolvedValueOnce(json({ phase: "current", hidden: true }));
    await expect(setPanoramaPhaseHidden("north", "current", true)).resolves.toBe(true);
    expect(request()).toEqual({
      url: "/api/territories/north/panorama-phases/current",
      method: "PUT",
      body: { hidden: true },
      csrf: "csrf",
    });
  });

  it("percent-encodes the territory slug", async () => {
    await setPanoramasHidden("a b/c", [1], false);
    await setPanoramasPhase("a b/c", [1], "prior");
    fetchMock.mockResolvedValueOnce(json({ phase: "prior", hidden: false }));
    await setPanoramaPhaseHidden("a b/c", "prior", false);
    for (const n of [0, 1, 2]) expect(request(n).url).toContain("a%20b%2Fc");
  });
});

describe("toPhaseHidden", () => {
  it("turns the bundle's three rows into a lookup", () => {
    expect(
      toPhaseHidden([
        { phase: "prior", hidden: false },
        { phase: "current", hidden: true },
        { phase: "post", hidden: false },
      ]),
    ).toEqual({ prior: false, current: true, post: false });
  });

  it("reads a bundle saved before phases existed as every phase shown", () => {
    // The desktop shell replays /scene snapshots; one saved before this field
    // has no panoramaPhases at all.
    expect(toPhaseHidden(undefined)).toEqual({ prior: false, current: false, post: false });
  });
});
