import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import {
  createPlacementGroup,
  deletePlacementGroup,
  renamePlacementGroup,
  setPlacementGroupHidden,
  toPlacementGroup,
} from "./placement-groups-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DTO = { id: 3, title: "Tank farm", hidden: false, createdAt: "c", updatedAt: "u" };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json(DTO)));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe("placement groups gateway", () => {
  it("keeps only what the panel draws: the id, the title and the flag", () => {
    expect(toPlacementGroup(DTO)).toEqual({ id: 3, title: "Tank farm", hidden: false });
  });

  it("keeps the group's own flag", () => {
    expect(toPlacementGroup({ ...DTO, hidden: true })).toEqual({ id: 3, title: "Tank farm", hidden: true });
  });

  it("POSTs a new group's title and maps the 201", async () => {
    fetchMock.mockResolvedValueOnce(json(DTO, 201));
    await expect(createPlacementGroup("north", "Tank farm")).resolves.toEqual({
      id: 3,
      title: "Tank farm",
      hidden: false,
    });
    expect(request()).toEqual({
      url: "/api/territories/north/placement-groups",
      method: "POST",
      body: { title: "Tank farm" },
    });
  });

  it("PATCHes a rename to the id-scoped route", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...DTO, title: "West tanks" }));
    await expect(renamePlacementGroup("north", 3, "West tanks")).resolves.toEqual({
      id: 3,
      title: "West tanks",
      hidden: false,
    });
    expect(request()).toEqual({
      url: "/api/territories/north/placement-groups/3",
      method: "PATCH",
      body: { title: "West tanks" },
    });
  });

  it("DELETEs the group and resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deletePlacementGroup("north", 3)).resolves.toBeUndefined();
    expect(request()).toMatchObject({ url: "/api/territories/north/placement-groups/3", method: "DELETE" });
  });

  it("PUTs a group's own flag to its hidden route and maps the answer", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...DTO, hidden: true }));
    await expect(setPlacementGroupHidden("north", 3, true)).resolves.toEqual({
      id: 3,
      title: "Tank farm",
      hidden: true,
    });
    expect(request()).toEqual({
      url: "/api/territories/north/placement-groups/3/hidden",
      method: "PUT",
      body: { hidden: true },
    });
  });

  it("percent-encodes the territory slug", async () => {
    await createPlacementGroup("a b/c", "x");
    expect(request().url).toContain("a%20b%2Fc");
  });
});
