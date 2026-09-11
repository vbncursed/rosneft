import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Placement } from "@/entities/placement";
import type { SceneBundle } from "@/entities/scene";
import type { Principal } from "@/shared/session";
import { HttpError } from "@/shared/api";
import { useTerritoryViewer, type TerritoryViewerState } from "./use-territory-viewer";

const { getSceneBundle, getMe, createPlacement, updatePlacement, deletePlacement, markTourSeen } =
  vi.hoisted(() => ({
    getSceneBundle: vi.fn(),
    getMe: vi.fn(),
    createPlacement: vi.fn(),
    updatePlacement: vi.fn(),
    deletePlacement: vi.fn(),
    markTourSeen: vi.fn(),
  }));

vi.mock("@/entities/scene", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSceneBundle,
}));
vi.mock("@/entities/user", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMe,
}));
vi.mock("@/entities/placement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPlacement,
  updatePlacement,
  deletePlacement,
}));
vi.mock("@/features/onboarding", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  markTourSeen,
}));

const SLUG = "refinery-block-c";

const placement = (id: number, modelSlug = "storage-tank-500"): Placement => ({
  id,
  territorySlug: SLUG,
  modelSlug,
  label: "",
  updatedAt: "2026-09-09T14:00:00Z",
  visiblePanoramaIds: [],
  position: { x: 12.4, y: 0, z: -8.25 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

const BUNDLE: SceneBundle = {
  territory: {
    slug: SLUG,
    title: "Refinery Block C",
    sourceBlobHash: "a".repeat(64),
    placementCount: 1,
    createdAt: "2026-09-04T09:00:00Z",
  },
  artifact: {
    lod: 0,
    hash: "h0",
    size: 9,
    vertices: 1_284_210,
    faces: 612_480,
    bboxMin: { x: 0, y: 0, z: 0 },
    bboxMax: { x: 36, y: 24, z: 8.5 },
    chain: [
      { lod: 0, hash: "h0", size: 9 },
      { lod: 1, hash: "h1", size: 5 },
      { lod: 2, hash: "h2", size: 2 },
    ],
  },
  placements: [placement(4)],
  modelOptions: [
    {
      slug: "storage-tank-500",
      title: "storage-tank-500",
      bboxMin: { x: 0, y: 0, z: 0 },
      bboxMax: { x: 3, y: 3, z: 3 },
      chain: [{ lod: 0, hash: "m0", size: 1 }],
    },
  ],
};

const principal = (over: Partial<Principal> = {}): Principal => ({
  id: "u1",
  email: "a@example.com",
  username: "a.ivanova",
  status: "active",
  totpEnabled: false,
  totpRequired: false,
  passkeyEnabled: false,
  roleSlugs: [],
  roleTitles: {},
  permissions: [],
  isOwner: false,
  onboardingToursSeen: ["viewer"],
  ...over,
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

// A fresh client per mount: two mounts in one test are two page loads, and a
// shared cache would answer the second with the first one's bundle.
const cold = () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTerritoryViewer(SLUG), { wrapper });
};

// The default mount warms the bundle first, which is how the page really
// renders: `TerritoryViewerScreen` keys the component that calls this hook on
// whether the bundle is in hand, so the hook's *first* render already has it.
// That matters because `usePlacementsEditor` seeds its list once, at mount —
// mounted cold it would seed empty and stay that way.
const mount = () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["scene", SLUG], BUNDLE);
  return renderHook(() => useTerritoryViewer(SLUG), { wrapper });
};

type Ready = Extract<TerritoryViewerState, { status: "ready" }>;
const ready = async (r: ReturnType<typeof cold>): Promise<Ready> => {
  await waitFor(() => expect(r.result.current.status).toBe("ready"));
  const state = r.result.current;
  if (state.status !== "ready") throw new Error("not ready");
  return state;
};
/** The live props after an interaction — `result.current` is a new object each render. */
const now = (r: ReturnType<typeof cold>): Ready => {
  const state = r.result.current;
  if (state.status !== "ready") throw new Error(`expected ready, got ${state.status}`);
  return state;
};

describe("useTerritoryViewer", () => {
  beforeEach(() => {
    getSceneBundle.mockReset().mockResolvedValue(BUNDLE);
    getMe.mockReset().mockResolvedValue(principal({ isOwner: true }));
    createPlacement.mockReset();
    updatePlacement.mockReset();
    deletePlacement.mockReset();
    markTourSeen.mockReset().mockResolvedValue(undefined);
  });

  describe("the four states", () => {
    it("is loading until both the principal and the bundle have answered", async () => {
      const r = cold();
      expect(r.result.current.status).toBe("loading");
      await ready(r);
    });

    it("is missing on a 404 — the territory is not this reader's, or not there", async () => {
      getSceneBundle.mockRejectedValue(new HttpError(404, null, "territory not found"));
      const r = cold();
      await waitFor(() => expect(r.result.current.status).toBe("missing"));
    });

    it("is unavailable, with the reason, on any other refusal", async () => {
      getSceneBundle.mockRejectedValue(new HttpError(503, null, "catalog is down"));
      const r = cold();
      await waitFor(() => expect(r.result.current.status).toBe("unavailable"));
      expect(r.result.current).toMatchObject({ error: "catalog is down" });
    });

    it("keeps the page when a background refetch fails — the bundle on screen is still good", async () => {
      const r = mount();
      await ready(r);
      getSceneBundle.mockRejectedValue(new Error("network"));
      await act(async () => {
        await client.refetchQueries({ queryKey: ["scene", SLUG] });
      });
      expect(r.result.current.status).toBe("ready");
    });
  });

  describe("grants", () => {
    it("gives an owner all four", async () => {
      const state = await ready(mount());
      expect(state.header.canReplace).toBe(true);
      expect(state.canvas.canWrite).toBe(true);
      expect(state.panel?.placements.grants).toEqual({ create: true, write: true, delete: true });
    });

    it("gives placement:write the move grant and nothing else", async () => {
      getMe.mockResolvedValue(principal({ permissions: ["placement:write"] }));
      const state = await ready(mount());
      expect(state.panel?.placements.grants).toEqual({ create: false, write: true, delete: false });
      expect(state.header.canReplace).toBe(false);
      expect(state.header.pills).toContainEqual({
        tone: "neutral",
        label: "editor · can move, cannot delete",
      });
    });

    it("needs territory:write before it offers the replace link", async () => {
      getMe.mockResolvedValue(principal({ permissions: ["territory:write"] }));
      expect((await ready(mount())).header.canReplace).toBe(true);
    });

    it("calls a reader with no placement grant a read-only viewer", async () => {
      getMe.mockResolvedValue(principal({ permissions: ["territory:read"] }));
      const state = await ready(mount());
      expect(state.header.guest).toBe(true);
      expect(state.overlays.tools.map((t) => t.key)).toEqual(["reset", "measure", "tour"]);
    });
  });

  describe("the canvas", () => {
    it("asks for LOD 0 and hands the mode and the empty selection down", async () => {
      const { canvas } = await ready(mount());
      expect(canvas.targetLod).toBe(0);
      expect(canvas.mode).toBe("orbit");
      expect(canvas.selectedId).toBeNull();
      expect(canvas.parentLods.map((a) => a.lod)).toEqual([0, 1, 2]);
    });

    it("feeds the report back into the strip and the switcher", async () => {
      const r = mount();
      const state = await ready(r);
      act(() =>
        state.canvas.onLod({
          shown: 2,
          target: 0,
          percent: 62,
          progressText: "6.1 / 9.8 MB",
          failure: null,
        }),
      );
      const after = now(r);
      expect(after.overlays.switcher?.shown).toBe(2);
      expect(after.overlays.strip.items.at(-1)).toBe("LOD 2 active · LOD 0 loading");
      expect(after.overlays.loading?.chip).toBe("coarse LOD 2 shown · LOD 0 62% · 6.1 / 9.8 MB");
    });

    it("keeps every canvas callback reference-stable across a re-render", async () => {
      const r = mount();
      const first = await ready(r);
      act(() => first.canvas.onLod({ shown: 0, target: 0, percent: 100, progressText: "9.8 MB", failure: null }));
      const second = now(r);
      expect(second.canvas.onPick).toBe(first.canvas.onPick);
      expect(second.canvas.onTransformCommit).toBe(first.canvas.onTransformCommit);
      expect(second.canvas.onLod).toBe(first.canvas.onLod);
    });
  });

  describe("selection", () => {
    it("names the picked instance in the panel and flips the tab to it", async () => {
      const r = mount();
      const state = await ready(r);
      expect(state.panel?.tab).toBe("view");
      act(() => state.canvas.onPick(4));
      const after = now(r);
      expect(after.canvas.selectedId).toBe(4);
      expect(after.panel?.tab).toBe("placements");
      expect(after.panel?.placements.selected?.name).toBe("storage-tank-500 #1");
    });

    it("frames an instance on request, as a fresh array the canvas can see change", async () => {
      const r = mount();
      const state = await ready(r);
      expect(state.canvas.focusRequest).toBeNull();
      act(() => state.panel!.placements.onFocus(4));
      expect(now(r).canvas.focusRequest).toEqual([4]);
    });
  });

  describe("placing objects", () => {
    it("writes one placement per instance, opens the form on the last and closes the picker", async () => {
      createPlacement
        .mockResolvedValueOnce(placement(10))
        .mockResolvedValueOnce(placement(11));
      const r = mount();
      const state = await ready(r);
      act(() => state.overlays.onAdd());
      expect(now(r).picker.open).toBe(true);

      await act(async () => now(r).picker.onPlace("storage-tank-500", 2));
      const after = now(r);
      expect(createPlacement).toHaveBeenCalledTimes(2);
      expect(after.picker.open).toBe(false);
      expect(after.canvas.selectedId).toBe(11);
      expect(after.panel?.placements.selected?.form?.kind).toBe("new");
    });

    it("refetches the bundle once the batch has landed", async () => {
      createPlacement.mockResolvedValue(placement(10));
      const r = mount();
      const state = await ready(r);
      const spy = vi.spyOn(client, "invalidateQueries");
      await act(async () => state.picker.onPlace("storage-tank-500", 1));
      expect(spy).toHaveBeenCalledWith({ queryKey: ["scene", SLUG] });
    });
  });

  describe("a failed mesh", () => {
    const fail = (state: Ready) => {
      act(() =>
        state.canvas.onLod({
          shown: null,
          target: 0,
          percent: null,
          progressText: null,
          failure: { hash: "h1", status: 502 },
        }),
      );
    };

    it("builds the card from the failure the canvas reported, never from a guess", async () => {
      const r = mount();
      fail(await ready(r));
      const after = now(r);
      expect(after.overlays.error?.copy.body).toContain("Storage returned 502 for the LOD 1 mesh.");
      expect(after.overlays.error?.copy.coarseLabel).toBe("Load coarse LOD 2 instead");
      expect(after.panel).toBeNull();
    });

    it("asks for the coarser level when the reader takes the way out", async () => {
      const r = mount();
      fail(await ready(r));
      act(() => now(r).overlays.error!.onCoarse!());
      expect(now(r).canvas.targetLod).toBe(2);
    });

    it("stamps the last attempt once — a later render does not move the clock", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        vi.setSystemTime(new Date(2026, 8, 9, 14, 22));
        const r = mount();
        fail(await ready(r));
        const stamped = now(r).overlays.error!.copy.footer;
        expect(stamped).toContain("last attempt 14:22");

        vi.setSystemTime(new Date(2026, 8, 9, 15, 30));
        act(() => now(r).overlays.onReset());
        expect(now(r).overlays.error!.copy.footer).toBe(stamped);
      } finally {
        vi.useRealTimers();
      }
    });

    it("re-arms the canvas on Try again", async () => {
      const r = mount();
      fail(await ready(r));
      expect(now(r).canvas.retryVersion).toBe(0);
      act(() => now(r).overlays.error!.onRetry());
      expect(now(r).canvas.retryVersion).toBe(1);
    });
  });

  describe("the tour", () => {
    it("stays shut for a reader who has already seen it", async () => {
      expect((await ready(mount())).tour.active).toBe(false);
    });

    it("runs on a first visit and forces the panel open", async () => {
      getMe.mockResolvedValue(principal({ isOwner: true, onboardingToursSeen: [] }));
      const r = mount();
      const state = await ready(r);
      expect(state.tour.active).toBe(true);
      expect(state.panel?.collapsed).toBe(false);
    });

    it("switches the panel to the tab a step's anchor lives on", async () => {
      getMe.mockResolvedValue(principal({ isOwner: true, onboardingToursSeen: [] }));
      const r = mount();
      await ready(r);
      // Walk to `add-object`, the first step whose target sits on the
      // Placements tab; without the switch its anchor is not in the DOM.
      // Bounded by the step count, so a tour that never starts fails the
      // assertion rather than spinning the worker to death.
      for (let i = 0; i < now(r).tour.total && now(r).tour.step?.id !== "add-object"; i++) {
        act(() => now(r).tour.next());
      }
      expect(now(r).tour.step?.id).toBe("add-object");
      expect(now(r).panel?.tab).toBe("placements");
    });
  });
});
