import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Placement } from "@/entities/placement";
import type { SceneBundle } from "@/entities/scene";
import type { Principal } from "@/shared/session";
import { HttpError } from "@/shared/api";
import { useTerritoryViewer, type TerritoryViewerState } from "./use-territory-viewer";

const {
  getSceneBundle,
  getMe,
  createPlacement,
  updatePlacement,
  deletePlacement,
  setPlacementVisibility,
  markTourSeen,
  createMeasurement,
  deleteMeasurements,
} = vi.hoisted(() => ({
  createMeasurement: vi.fn(),
  deleteMeasurements: vi.fn(),
  getSceneBundle: vi.fn(),
  getMe: vi.fn(),
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  deletePlacement: vi.fn(),
  setPlacementVisibility: vi.fn(),
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
  setPlacementVisibility,
}));
vi.mock("@/entities/measurement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createMeasurement,
  deleteMeasurements,
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
  panoramas: [
    {
      id: 1,
      territorySlug: SLUG,
      slug: "control-room",
      title: "Control room",
      sourceBlobHash: "p1",
      position: { x: 1, y: 0, z: 2 },
      yawOffset: 0,
      defaultYaw: 0,
      updatedAt: "2026-09-14T10:00:00Z",
    },
  ],
  documents: [
    {
      id: 7,
      territorySlug: SLUG,
      title: "Fire plan.pdf",
      sourceBlobHash: "d7",
      createdAt: "2026-09-14T10:00:00Z",
    },
  ],
  measurements: [
    {
      serverId: 31,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      closed: false,
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
    setPlacementVisibility.mockReset();
    updatePlacement.mockReset();
    deletePlacement.mockReset();
    markTourSeen.mockReset().mockResolvedValue(undefined);
    createMeasurement.mockReset().mockImplementation((_slug, body) => Promise.resolve({ serverId: 32, ...body }));
    deleteMeasurements.mockReset().mockResolvedValue(undefined);
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

    it("does not call a 404 from the principal a missing territory", async () => {
      // Only the scene's 404 says "not there, or not yours"; /me answering 404
      // is a broken session route, and "Territory not found" would be a lie
      // about a territory the reader may well be able to see.
      getMe.mockRejectedValue(new HttpError(404, null, "route not found"));
      const r = cold();
      await waitFor(() => expect(r.result.current.status).toBe("unavailable"));
      expect(r.result.current).toMatchObject({ error: "route not found" });
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
      expect(state.overlays.tools.map((t) => t.key)).toEqual([
        "reset",
        "measure",
        "panoramas",
        "documents",
        "tour",
      ]);
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

  describe("measuring", () => {
    const measureAndFinish = (r: ReturnType<typeof cold>) => {
      // The chip speaks only over a drawn level.
      act(() =>
        now(r).canvas.onLod({ shown: 0, target: 0, percent: null, progressText: null, failure: null }),
      );
      act(() => now(r).overlays.onMeasure());
      act(() => now(r).canvas.onMeasurePoint({ x: 0, y: 0, z: 0 }));
      act(() => now(r).canvas.onMeasurePoint({ x: 0, y: 0, z: 1 }));
      act(() => now(r).overlays.measuring!.onCloseChain());
    };

    it("draws the territory's saved chains from the bundle", async () => {
      const state = await ready(mount());
      expect(state.canvas.chains).toMatchObject([{ serverId: 31, sync: "saved" }]);
      expect(state.canvas.canEditMeasurements).toBe(true);
    });

    it("saves a finished chain for a reader who may create one", async () => {
      getMe.mockResolvedValue(principal({ permissions: ["measurement:read", "measurement:create"] }));
      const r = mount();
      await ready(r);
      measureAndFinish(r);
      expect(createMeasurement).toHaveBeenCalledExactlyOnceWith(SLUG, {
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 1 },
        ],
        closed: false,
      });
      await waitFor(() => expect(now(r).canvas.chains.at(-1)).toMatchObject({ serverId: 32 }));
      expect(now(r).overlays.chip?.text).not.toContain("not saved");
    });

    // Review M6 I-2: the body seeds once from the cached bundle when the reader
    // comes back in the SPA, so a bundle that predates a save must not be the
    // one it seeds from. No GET while the page is open; the entry is dropped
    // on the way out, and the next visit loads cold.
    it("drops the cached bundle on unmount once a chain is saved, without refetching it on the page", async () => {
      const r = mount();
      await ready(r);
      const calls = getSceneBundle.mock.calls.length;
      measureAndFinish(r);
      await waitFor(() => expect(now(r).canvas.chains.at(-1)).toMatchObject({ serverId: 32 }));
      expect(getSceneBundle.mock.calls.length).toBe(calls);
      r.unmount();
      expect(client.getQueryData(["scene", SLUG])).toBeUndefined();
    });

    // A rename writes the scene with setQueryData, which clears TanStack's
    // invalidated flag — the saved chain must still drop the bundle.
    it("drops the cached bundle on unmount even when a rename rewrote it after the save", async () => {
      const r = mount();
      await ready(r);
      measureAndFinish(r);
      await waitFor(() => expect(now(r).canvas.chains.at(-1)).toMatchObject({ serverId: 32 }));
      act(() => client.setQueryData<typeof BUNDLE>(["scene", SLUG], (old) => old && { ...old }));
      r.unmount();
      expect(client.getQueryData(["scene", SLUG])).toBeUndefined();
    });

    // The reader finishes a chain and leaves before the POST answers: the
    // cleanup already ran, so the late write must drop the bundle itself.
    it("drops the cached bundle when a save lands after the page has unmounted", async () => {
      let land!: (m: unknown) => void;
      createMeasurement.mockImplementation(() => new Promise((resolve) => (land = resolve)));
      const r = mount();
      await ready(r);
      measureAndFinish(r);
      r.unmount();
      expect(client.getQueryData(["scene", SLUG])).toBe(BUNDLE);
      await act(async () => land({ serverId: 32, points: [], closed: false }));
      expect(client.getQueryData(["scene", SLUG])).toBeUndefined();
    });

    it("keeps the cached bundle on unmount when nothing changed", async () => {
      const r = mount();
      await ready(r);
      r.unmount();
      expect(client.getQueryData(["scene", SLUG])).toBe(BUNDLE);
    });

    it("keeps a reader's chain local, says so on the chip, and hides the saved chains' remove buttons", async () => {
      getMe.mockResolvedValue(principal({ permissions: ["measurement:read"] }));
      const r = mount();
      const state = await ready(r);
      expect(state.canvas.canEditMeasurements).toBe(false);
      measureAndFinish(r);
      expect(createMeasurement).not.toHaveBeenCalled();
      expect(now(r).overlays.chip?.text).toBe("measure · 2 segments · 36.00 m total · not saved");
      // Clear takes only the reader's own chain, without asking.
      act(() => now(r).overlays.measuring!.onClear());
      expect(now(r).overlays.measuring!.confirm).toBeNull();
      expect(now(r).canvas.chains.map((c) => c.serverId)).toEqual([31]);
      expect(deleteMeasurements).not.toHaveBeenCalled();
    });

    it("asks before a measurement:delete holder clears the territory, then deletes it", async () => {
      const r = mount();
      await ready(r);
      act(() => now(r).overlays.onMeasure());
      act(() => now(r).overlays.measuring!.onClear());
      expect(now(r).overlays.measuring!.confirm?.title).toBe("Delete 1 measurement on this territory?");
      expect(deleteMeasurements).not.toHaveBeenCalled();
      act(() => now(r).overlays.measuring!.confirm!.onConfirm());
      expect(deleteMeasurements).toHaveBeenCalledExactlyOnceWith(SLUG);
      expect(now(r).canvas.chains).toEqual([]);
    });

    describe("the ruler switch", () => {
      // A failure mid-test must not leave "hidden" behind for the next one.
      afterEach(() => localStorage.clear());

      it("hides the ruler from the View tab, keeps the chains, and remembers it for the next load", async () => {
        localStorage.clear();
        const r = mount();
        const state = await ready(r);
        expect(state.canvas.showMeasurements).toBe(true);
        expect(state.panel!.viewTab.measurements).toMatchObject({ saved: 1, show: true });

        act(() => state.panel!.viewTab.measurements.onToggle());
        expect(now(r).canvas.showMeasurements).toBe(false);
        expect(now(r).canvas.chains).toHaveLength(1);
        // Entering measure mode leaves the stored choice alone — the canvas decides the override.
        act(() => now(r).overlays.onMeasure());
        expect(now(r).canvas.showMeasurements).toBe(false);
        expect(now(r).canvas.mode).toBe("measure");

        r.unmount();
        expect((await ready(mount())).canvas.showMeasurements).toBe(false);
      });
    });

    it("drops an unfinished chain when the reader leaves measure mode", async () => {
      const r = mount();
      const state = await ready(r);
      act(() => state.overlays.onMeasure());
      act(() => now(r).canvas.onMeasurePoint({ x: 0, y: 0, z: 0 }));
      expect(now(r).canvas.activeChainId).not.toBeNull();

      act(() => now(r).overlays.onMeasure());
      expect(now(r).canvas.mode).toBe("orbit");
      // Left open, the next measure click would append a segment from the
      // stale point and the first Esc in orbit would be spent on it.
      expect(now(r).canvas.activeChainId).toBeNull();
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

    it("marks the bundle and the catalogs stale, without refetching, once the batch has landed", async () => {
      createPlacement.mockResolvedValue(placement(10));
      const r = mount();
      client.setQueryData(["model", "storage-tank-500"], {});
      const state = await ready(r);
      const spy = vi.spyOn(client, "invalidateQueries");
      const fetched = getSceneBundle.mock.calls.length;

      await act(async () => state.picker.onPlace("storage-tank-500", 1));

      expect(spy).toHaveBeenCalledWith({ queryKey: ["scene", SLUG], refetchType: "none" });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["territories"], refetchType: "none" });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["models"], refetchType: "none" });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["territory", SLUG], refetchType: "none" });
      expect(spy).toHaveBeenCalledWith({ queryKey: ["model"], refetchType: "none" });
      expect(client.getQueryState(["scene", SLUG])?.isInvalidated).toBe(true);
      // Model detail keeps Delete disabled on usageCount, so every detail goes stale.
      expect(client.getQueryState(["model", "storage-tank-500"])?.isInvalidated).toBe(true);
      expect(getSceneBundle.mock.calls.length).toBe(fetched);
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
      const before = now(r).canvas.retryVersion;
      act(() => now(r).overlays.error!.onCoarse!());
      expect(now(r).canvas.targetLod).toBe(2);
      // And re-arms: the failure is held until a retry, and while it is held
      // nothing is drawn — a new target on its own changed the number and left
      // the card exactly where it was.
      expect(now(r).canvas.retryVersion).toBe(before + 1);
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

  describe("panoramas and documents", () => {
    const owner = () => principal({ isOwner: true });

    it("offers Move points to a panorama writer and refuses it to everyone else", async () => {
      expect((await ready(mount())).panel?.viewTab.panoramas.canMovePoints).toBe(true);

      getMe.mockResolvedValue(principal({ permissions: ["territory:read"] }));
      const guest = await ready(mount());
      expect(guest.panel?.viewTab.panoramas.canMovePoints).toBe(false);
      expect(guest.panel?.viewTab.panoramas.canUpload).toBe(false);
    });

    it("lists the territory's captures and its PDFs on the View tab", async () => {
      const state = await ready(mount());
      expect(state.panel?.viewTab.panoramas.rows.map((r) => r.title)).toEqual(["Control room"]);
      expect(state.panel?.viewTab.documents.rows).toEqual([{ id: 7, name: "Fire plan.pdf" }]);
    });

    it("cycles into the first panorama on P — the key reaches the list through the ref", async () => {
      // The mode reducer is created before the panorama hooks that answer P,
      // so the cycle travels through a ref; a broken one leaves this a no-op.
      getMe.mockResolvedValue(owner());
      const r = mount();
      await ready(r);
      act(() => {
        fireEvent.keyDown(window, { key: "p" });
      });
      expect(now(r).canvas.activePanorama?.id).toBe(1);
      expect(now(r).overlays.switchTo3d).not.toBeNull();
      expect(now(r).header.pills).toContainEqual({ tone: "accent", label: "panorama" });
    });

    it("gives Escape to an open document before the scene sees it", async () => {
      const r = mount();
      const state = await ready(r);
      act(() => state.panel!.viewTab.documents.onOpen(7));
      expect(now(r).overlays.document?.document.id).toBe(7);

      act(() => {
        fireEvent.keyDown(window, { key: "Escape" });
      });
      expect(now(r).overlays.document).toBeNull();
    });

    it("opens a document out of the panorama it was read from", async () => {
      const r = mount();
      const state = await ready(r);
      act(() => state.panel!.viewTab.panoramas.onEnter(1));
      act(() => now(r).panel!.viewTab.documents.onOpen(7));
      // The two overlays do not stack: the PDF takes the viewport.
      expect(now(r).canvas.activePanorama).toBeNull();
    });

    it("puts the View tab in front when a rail tile asks for a section", async () => {
      const r = mount();
      const state = await ready(r);
      act(() => state.canvas.onPick(4));
      expect(now(r).panel?.tab).toBe("placements");

      act(() => now(r).overlays.onPanoramas());
      expect(now(r).panel?.tab).toBe("view");
      expect(now(r).panel?.collapsed).toBe(false);
    });

    it("brings a hidden document window back when the Documents tile is pressed", async () => {
      const r = mount();
      const state = await ready(r);
      act(() => state.panel!.viewTab.documents.onOpen(7));
      act(() => now(r).overlays.document!.onWindow("collapsed"));
      expect(now(r).overlays.document?.document.title).toBe("Fire plan.pdf");
      expect(now(r).overlays.document?.window).toBe("collapsed");

      act(() => now(r).overlays.onDocuments());
      expect(now(r).overlays.document?.window).toBe("pip");
    });

    it("makes a newly placed object visible in every panorama there is", async () => {
      createPlacement.mockResolvedValue(placement(10));
      const r = mount();
      const state = await ready(r);
      await act(async () => state.picker.onPlace("storage-tank-500", 1));
      expect(createPlacement).toHaveBeenCalledWith(
        SLUG,
        expect.objectContaining({ visiblePanoramaIds: [1] }),
      );
    });

    it("writes the selected object's allowlist from the block inside a panorama", async () => {
      setPlacementVisibility.mockResolvedValue({ ...placement(4), visiblePanoramaIds: [1] });
      const r = mount();
      const state = await ready(r);
      act(() => state.panel!.viewTab.panoramas.onEnter(1));
      act(() => now(r).canvas.onPick(4));

      const block = now(r).panel?.placements.visibility;
      expect(block?.panoramas).toEqual([{ id: 1, title: "Control room" }]);
      await act(async () => block!.onToggle(4, 1, true));
      expect(setPlacementVisibility).toHaveBeenCalledWith(SLUG, 4, [1]);
    });

    it("takes the allowlist away again when the ticked capture is unticked", async () => {
      setPlacementVisibility.mockResolvedValue(placement(4));
      const r = mount();
      const state = await ready(r);
      act(() => state.panel!.viewTab.panoramas.onEnter(1));
      act(() => now(r).canvas.onPick(4));
      await act(async () => now(r).panel!.placements.visibility!.onToggle(4, 1, true));
      await act(async () => now(r).panel!.placements.visibility!.onToggle(4, 1, false));
      expect(setPlacementVisibility).toHaveBeenLastCalledWith(SLUG, 4, []);
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

  describe("the panorama tour", () => {
    it("starts the first time the reader steps inside a panorama", async () => {
      const r = mount();
      const state = await ready(r);
      expect(state.panoramaTour.active).toBe(false);
      act(() => state.panel!.viewTab.panoramas.onEnter(1));
      expect(now(r).panoramaTour.active).toBe(true);
    });

    it("stays shut for a reader who has already seen it", async () => {
      getMe.mockResolvedValue(
        principal({ isOwner: true, onboardingToursSeen: ["viewer", "panorama"] }),
      );
      const r = mount();
      const state = await ready(r);
      act(() => state.panel!.viewTab.panoramas.onEnter(1));
      expect(now(r).panoramaTour.active).toBe(false);
    });

    it("does not start while the viewer tour is still running", async () => {
      getMe.mockResolvedValue(principal({ isOwner: true, onboardingToursSeen: [] }));
      const r = mount();
      const state = await ready(r);
      expect(state.tour.active).toBe(true);
      act(() => state.panel!.viewTab.panoramas.onEnter(1));
      expect(now(r).panoramaTour.active).toBe(false);
    });

    // The panel takes forcedTab/forceExpanded from *whichever* tour is
    // active, not only the viewer one — dropping either `?? panoramaTour...`
    // fallback leaves the panorama tour running with its anchor on a hidden
    // tab or behind a folded panel.
    it("switches the panel to the panorama tour's tab and un-collapses it, not just the viewer tour's", async () => {
      const r = mount();
      const state = await ready(r);
      // The reader had picked a placement (tab -> "placements") and folded
      // the panel away, before ever entering a panorama.
      act(() => state.canvas.onPick(4));
      act(() => now(r).panel!.onCollapsedChange(true));
      expect(now(r).panel?.tab).toBe("placements");
      expect(now(r).panel?.collapsed).toBe(true);

      act(() => now(r).panel!.viewTab.panoramas.onEnter(1));
      act(() => now(r).panoramaTour.next());
      expect(now(r).panoramaTour.step?.id).toBe("panorama-view-toggle");

      expect(now(r).panel?.tab).toBe("view");
      expect(now(r).panel?.collapsed).toBe(false);
    });
  });
});
