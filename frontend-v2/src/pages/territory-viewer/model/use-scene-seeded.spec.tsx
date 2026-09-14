import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSceneSeeded } from "./use-scene-seeded";

const { getSceneBundle } = vi.hoisted(() => ({ getSceneBundle: vi.fn() }));
vi.mock("@/entities/scene", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSceneBundle,
}));

const BUNDLE = { territory: {}, artifact: null, placements: [], modelOptions: [] };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const mount = () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useSceneSeeded("t"), { wrapper });
};

describe("useSceneSeeded", () => {
  beforeEach(() => getSceneBundle.mockReset().mockResolvedValue(BUNDLE));

  // The answer is `data !== undefined` and nothing else: a bundle still in
  // flight and a bundle that was refused look the same here, and both mean the
  // editor has nothing to seed from yet.
  it("is false until the bundle answers, then true", async () => {
    const r = mount();
    expect(r.result.current).toBe(false);
    await waitFor(() => expect(r.result.current).toBe(true));
  });

  it("is true on the first render when the bundle is already cached", () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["scene", "t"], BUNDLE);
    expect(renderHook(() => useSceneSeeded("t"), { wrapper }).result.current).toBe(true);
    expect(getSceneBundle).not.toHaveBeenCalled();
  });
});
