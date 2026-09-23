import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useEditDetails } from "./use-edit-details";

const { updateModel, updateTerritory } = vi.hoisted(() => ({
  updateModel: vi.fn(),
  updateTerritory: vi.fn(),
}));
vi.mock("@/entities/model", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateModel,
}));
vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateTerritory,
}));

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const hook = (kind: "model" | "territory", slug: string) =>
  renderHook(() => ({ save: useEditDetails(kind, slug), notices: useNotices() }), { wrapper });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  updateModel.mockReset();
  updateTerritory.mockReset();
  clearNotices();
});

describe("useEditDetails", () => {
  it("merges the saved details into cached rows, keeping fields the PATCH answer lacks", async () => {
    client.setQueryData(["models"], [{ slug: "valve", title: "Valve", description: "Old", lods: [1, 2] }]);
    updateModel.mockResolvedValue({ slug: "valve", title: "Valve B" });
    const { result } = hook("model", "valve");
    await act(() => result.current.save.mutateAsync({ title: "Valve B" }));

    expect(client.getQueryData(["models"])).toEqual([{ slug: "valve", title: "Valve B", description: undefined, lods: [1, 2] }]);
  });

  it("leaves caches that were never loaded empty rather than inventing them", async () => {
    updateTerritory.mockResolvedValue({ slug: "yard", title: "Yard" });
    const { result } = hook("territory", "yard");
    await act(() => result.current.save.mutateAsync({ title: "Yard" }));

    expect(client.getQueryData(["territory", "yard"])).toBeUndefined();
    expect(client.getQueryData(["territories"])).toBeUndefined();
    expect(client.getQueryData(["scene", "yard"])).toBeUndefined();
  });

  it("does not touch a model's cache when a territory is saved", async () => {
    client.setQueryData(["models"], [{ slug: "yard", title: "A model" }]);
    updateTerritory.mockResolvedValue({ slug: "yard", title: "North yard" });
    const { result } = hook("territory", "yard");
    await act(() => result.current.save.mutateAsync({ title: "North yard" }));

    expect(client.getQueryData(["models"])).toEqual([{ slug: "yard", title: "A model" }]);
  });

  // setQueryData clears a query's invalidated mark. A placement write marks
  // the lists and the scene stale without refetching; a rename after it must
  // not make their old placementCount look fresh again.
  it("keeps a copy that was marked stale before the save marked stale after it", async () => {
    client.setQueryData(["territories"], [{ slug: "yard", title: "Yard", placementCount: 1 }]);
    client.setQueryData(["territory", "yard"], { slug: "yard", title: "Yard" });
    client.setQueryData(["scene", "yard"], { territory: { slug: "yard", title: "Yard" } });
    await client.invalidateQueries({ queryKey: ["territories"], refetchType: "none" });
    await client.invalidateQueries({ queryKey: ["scene", "yard"], refetchType: "none" });
    updateTerritory.mockResolvedValue({ slug: "yard", title: "North yard" });
    const { result } = hook("territory", "yard");
    await act(() => result.current.save.mutateAsync({ title: "North yard" }));

    expect(client.getQueryData(["territories"])).toEqual([
      { slug: "yard", title: "North yard", description: undefined, placementCount: 1 },
    ]);
    expect(client.getQueryState(["territories"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["scene", "yard"])?.isInvalidated).toBe(true);
    // A copy nobody had marked stale is exactly as fresh as the answer.
    expect(client.getQueryState(["territory", "yard"])?.isInvalidated).toBe(false);
  });

  it("renames a model in every cached scene bundle's model options, keeping stale marks", async () => {
    const option = (slug: string, title: string) => ({ slug, title, chain: [] });
    client.setQueryData(["scene", "yard"], { territory: { slug: "yard" }, modelOptions: [option("valve", "Valve"), option("pump", "Pump")] });
    client.setQueryData(["scene", "plant"], { territory: { slug: "plant" }, modelOptions: [option("valve", "Valve")] });
    const other = { territory: { slug: "shed" }, modelOptions: [option("pump", "Pump")] };
    client.setQueryData(["scene", "shed"], other, { updatedAt: 1 });
    await client.invalidateQueries({ queryKey: ["scene", "plant"], refetchType: "none" });
    updateModel.mockResolvedValue({ slug: "valve", title: "Gate valve" });
    const { result } = hook("model", "valve");
    await act(() => result.current.save.mutateAsync({ title: "Gate valve" }));

    type Bundle = { modelOptions: { slug: string; title: string }[] };
    expect(client.getQueryData<Bundle>(["scene", "yard"])!.modelOptions.map((o) => o.title)).toEqual(["Gate valve", "Pump"]);
    expect(client.getQueryData<Bundle>(["scene", "plant"])!.modelOptions[0]).toEqual(option("valve", "Gate valve"));
    expect(client.getQueryState(["scene", "plant"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["scene", "yard"])?.isInvalidated).toBe(false);
    // A bundle that does not offer the model is not rewritten (nor made fresh).
    expect(client.getQueryData(["scene", "shed"])).toBe(other);
    expect(client.getQueryState(["scene", "shed"])?.dataUpdatedAt).toBe(1);
  });

  it("toasts the gateway's reason when the save is refused", async () => {
    updateModel.mockRejectedValue(new HttpError(403, { code: "forbidden", message: "no grant" }, "no grant"));
    const { result } = hook("model", "valve");
    act(() => result.current.save.mutate({ title: "X" }));

    await waitFor(() => expect(result.current.notices.map((n) => n.message)).toContain("no grant"));
  });
});
