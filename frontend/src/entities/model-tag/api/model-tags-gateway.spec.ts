import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { createModelTag, renameModelTag } from "./model-tags-gateway";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(json({ slug: "camps", title: "Camps" }, 201)));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => vi.unstubAllGlobals());

const request = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(init.body as string) as unknown };
};

describe("model tags gateway", () => {
  it("creates a tag with POST /api/model-tags and returns it as a domain tag", async () => {
    const out = await createModelTag({ slug: "camps", title: "Camps" });
    expect(request()).toEqual({ url: "/api/model-tags", method: "POST", body: { slug: "camps", title: "Camps" } });
    expect(out).toEqual({ slug: "camps", title: "Camps" });
  });

  it("renames by slug, encoded, sending the title alone", async () => {
    fetchMock.mockResolvedValueOnce(json({ slug: "a b", title: "New" }));
    const out = await renameModelTag("a b", { title: "New" });
    expect(request()).toEqual({ url: "/api/model-tags/a%20b", method: "PATCH", body: { title: "New" } });
    expect(out).toEqual({ slug: "a b", title: "New" });
  });
});
