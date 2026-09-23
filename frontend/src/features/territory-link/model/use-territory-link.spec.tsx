import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
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

let client: QueryClient;
let onChanged: ReturnType<typeof vi.fn<() => void>>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const link = (initial?: string) =>
  renderHook(
    () => ({
      s: useTerritoryLink("refinery-block-c", initial, onChanged),
      notices: useNotices(),
    }),
    { wrapper },
  );

beforeEach(() => {
  client = new QueryClient();
  onChanged = vi.fn();
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

  // The viewer seeds the link from the scene bundle, and the catalog and Home
  // cards read it from the list: the viewer's onChanged marks all of them and
  // drops the bundle on the way out, so a return visit seeds the new link.
  it("tells the viewer the territory changed once the link is saved", async () => {
    vi.mocked(updateTerritory).mockResolvedValue(territory());
    const { result } = link("https://tour.example/a");

    await act(async () => {
      await result.current.s.save("");
    });

    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("reports no change when the save is refused", async () => {
    vi.mocked(updateTerritory).mockRejectedValue(new Error("network drop"));
    const { result } = link("https://tour.example/a");

    await act(async () => {
      await result.current.s.save("");
    });

    expect(onChanged).not.toHaveBeenCalled();
  });
});
