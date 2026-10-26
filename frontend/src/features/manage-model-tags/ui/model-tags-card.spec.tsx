import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { setCsrfToken } from "@/shared/api";
import { clearNotices } from "@/shared/lib/notify";
import { ModelTagsCard } from "./model-tags-card";

const TAGS = [
  { slug: "camps", title: "Camps" },
  { slug: "ungrouped", title: "Ungrouped" },
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<Response>>;
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn((url, init) =>
    Promise.resolve(
      init?.method === "PATCH"
        ? json({ slug: "camps", title: "Camp sites" })
        : json(url === "/api/model-tags" ? TAGS : []),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("csrf");
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotices();
});

const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ModelTagsCard />
    </QueryClientProvider>,
  );

describe("ModelTagsCard", () => {
  it("lists every tag with its slug, and no delete control", async () => {
    mount();
    expect(await screen.findByText("Camps")).toBeInTheDocument();
    expect(screen.getByText("camps")).toBeInTheDocument();
    expect(screen.getByText("Built in, cannot be changed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
  });

  it("renames a tag through PATCH and marks every scene bundle stale", async () => {
    const user = userEvent.setup();
    mount();
    client.setQueryData(["scene", "t-1"], {});
    await user.click(await screen.findByRole("button", { name: "Rename Camps" }));
    const input = screen.getByRole("textbox", { name: "Title for Camps" });
    await user.clear(input);
    await user.type(input, "Camp sites");
    await user.click(screen.getByRole("button", { name: "Save title for Camps" }));
    await waitFor(() => expect(client.getQueryState(["scene", "t-1"])?.isInvalidated).toBe(true));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/model-tags/camps");
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ title: "Camp sites" });
  });

  it("shows a 400 from the server on the add form", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Camps");
    fetchMock.mockResolvedValueOnce(
      json(
        { code: "invalid_input", message: "invalid input: a model tag with this slug or title already exists" },
        400,
      ),
    );
    await user.type(screen.getByLabelText("Slug"), "camps");
    await user.type(screen.getByLabelText("Title"), "Camps");
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("a model tag with this slug or title already exists");
  });
});
