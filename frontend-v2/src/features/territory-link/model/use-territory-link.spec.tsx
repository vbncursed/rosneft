import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTerritory, type Territory } from "@/entities/territory";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useTerritoryLink } from "./use-territory-link";

vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateTerritory: vi.fn(),
}));

const territory = (externalPanoramaUrl?: string): Territory => ({
  slug: "refinery-block-c",
  title: "Refinery Block C",
  sourceBlobHash: "h1",
  placementCount: 2,
  ...(externalPanoramaUrl === undefined ? {} : { externalPanoramaUrl }),
});

const link = (initial?: string) =>
  renderHook(() => ({
    s: useTerritoryLink("refinery-block-c", initial),
    notices: useNotices(),
  }));

beforeEach(() => {
  vi.mocked(updateTerritory).mockReset();
  clearNotices();
});

describe("useTerritoryLink", () => {
  it("starts from the territory's url, empty when it has none", () => {
    expect(link("https://tour.example/a").result.current.s.url).toBe("https://tour.example/a");
    expect(link().result.current.s.url).toBe("");
  });

  it("patches externalPanoramaUrl and adopts the answer's url", async () => {
    vi.mocked(updateTerritory).mockResolvedValue(territory("https://tour.example/b"));
    const { result } = link("https://tour.example/a");

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.s.save("https://tour.example/b");
    });

    expect(updateTerritory).toHaveBeenCalledWith("refinery-block-c", {
      externalPanoramaUrl: "https://tour.example/b",
    });
    expect(ok).toBe(true);
    expect(result.current.s.url).toBe("https://tour.example/b");
    expect(result.current.s.saving).toBe(false);
    expect(result.current.notices).toEqual([]);
  });

  it("reads a cleared link as empty rather than undefined", async () => {
    vi.mocked(updateTerritory).mockResolvedValue(territory());
    const { result } = link("https://tour.example/a");

    await act(async () => {
      await result.current.s.save("");
    });

    expect(result.current.s.url).toBe("");
  });

  it("toasts the refusal, keeps the old url and answers false", async () => {
    vi.mocked(updateTerritory).mockRejectedValue(
      new HttpError(422, { code: "invalid_input", message: "not a url" }, "not a url"),
    );
    const { result } = link("https://tour.example/a");

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.s.save("nope");
    });

    expect(ok).toBe(false);
    expect(result.current.s.url).toBe("https://tour.example/a");
    expect(result.current.s.saving).toBe(false);
    expect(result.current.notices[0]?.message).toContain("not a url");
  });
});
