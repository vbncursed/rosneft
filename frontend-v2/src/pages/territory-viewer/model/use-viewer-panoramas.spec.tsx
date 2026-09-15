import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";
import type { PanoramaViewMode } from "@/features/panorama-view";
import { useViewerPanoramas } from "./use-viewer-panoramas";

const { list, usePanoramaList, usePanoramaTexture, usePanoramaUpload, useTerritoryLink } =
  vi.hoisted(() => {
    const list = { panoramas: [] as unknown[], pendingId: null, add: vi.fn(), update: vi.fn(), remove: vi.fn() };
    return {
      list,
      // A fresh object each render, exactly as the real hook returns one: the
      // composite must depend on its stable members, not on the object.
      usePanoramaList: vi.fn(() => ({ ...list })),
      usePanoramaTexture: vi.fn(() => ({ bitmap: null, progress: null, status: "idle" })),
      usePanoramaUpload: vi.fn((params: { onCreated: (p: never) => void }) => ({
        params,
        canSubmit: false,
      })),
      useTerritoryLink: vi.fn(() => ({ url: "", saving: false, save: vi.fn() })),
    };
  });

// The gateway-bound hooks are stubbed; the pure ones — the view, the
// calibration draft, the marker drag — run for real, because what this hook
// does *is* wire those three to the list's optimistic writes.
vi.mock("@/features/panorama-view", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  usePanoramaList,
  usePanoramaTexture,
}));
vi.mock("@/features/panorama-upload", () => ({ usePanoramaUpload }));
vi.mock("@/features/territory-link", () => ({ useTerritoryLink }));

const panorama = (id: number, over: Partial<Panorama> = {}): Panorama => ({
  id,
  territorySlug: "refinery-block-c",
  slug: `capture-${id}`,
  title: `Capture ${id}`,
  sourceBlobHash: `p${id}`,
  position: { x: 1, y: 0, z: 2 },
  yawOffset: 0.1,
  defaultYaw: 0,
  updatedAt: "2026-09-14T10:00:00Z",
  ...over,
});

const PANORAMAS = [panorama(1), panorama(2)];

const modeStub = (over: Partial<PanoramaViewMode> = {}): PanoramaViewMode => ({
  view: { kind: "scene" },
  editingPanoramaId: null,
  enterPanorama: vi.fn(),
  exitPanorama: vi.fn(),
  startEdit: vi.fn(),
  closeEdit: vi.fn(),
  ...over,
});

const decode = vi.fn();
const onChanged = vi.fn();

const mount = (mode = modeStub(), moving = false) =>
  renderHook(
    (props: { mode: PanoramaViewMode; moving: boolean }) =>
      useViewerPanoramas({
        slug: "refinery-block-c",
        initial: PANORAMAS,
        mode: props.mode,
        moving: props.moving,
        sourceBbox: null,
        externalUrl: "https://tour.example",
        onChanged,
        decode,
      }),
    { initialProps: { mode, moving } },
  );

describe("useViewerPanoramas", () => {
  beforeEach(() => {
    list.panoramas = PANORAMAS;
    list.update.mockReset();
    list.add.mockReset();
    list.remove.mockReset();
    usePanoramaTexture.mockClear();
    useTerritoryLink.mockClear();
  });

  it("seeds the list from the bundle and reports what it holds", () => {
    const { result } = mount();
    expect(usePanoramaList).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "refinery-block-c", initial: PANORAMAS, onChanged }),
    );
    expect(result.current.list).toBe(PANORAMAS);
  });

  it("entering a panorama also opens its anchor card — one click, both", () => {
    const mode = modeStub();
    const { result } = mount(mode);
    act(() => result.current.onEnter(2));
    expect(mode.enterPanorama).toHaveBeenCalledWith(2);
    expect(mode.startEdit).toHaveBeenCalledWith(2);
  });

  it("downloads the texture of the panorama the camera is inside, with the injected decoder", () => {
    mount(modeStub({ view: { kind: "panorama", id: 2 } }));
    expect(usePanoramaTexture).toHaveBeenLastCalledWith("p2", decode);
  });

  it("asks for no texture at all in the 3D view", () => {
    mount();
    expect(usePanoramaTexture).toHaveBeenLastCalledWith(null, decode);
  });

  it("writes a dropped marker's position through the list, and nothing else", () => {
    const { result } = mount(modeStub(), true);
    act(() => result.current.drag.begin(1));
    act(() => result.current.drag.move({ x: 4, y: 0, z: -1 }));
    act(() => result.current.drag.end());
    expect(list.update).toHaveBeenCalledWith(1, { position: { x: 4, y: 0, z: -1 } });
  });

  it("drops an unfinished drag when the reducer leaves move mode", () => {
    // One source of truth: `move` is the reducer's, and the drag hook must not
    // keep a half-dragged marker alive behind a sub-mode that is already over.
    const { result, rerender } = mount(modeStub(), true);
    act(() => result.current.drag.begin(1));
    expect(result.current.drag.draggingId).toBe(1);

    rerender({ mode: modeStub(), moving: false });
    expect(result.current.drag.draggingId).toBeNull();
    expect(list.update).not.toHaveBeenCalled();
  });

  it("saves a calibration as the anchor and the yaw together", () => {
    const { result } = mount(modeStub({ editingPanoramaId: 1 }));
    act(() => result.current.calibration.onStart());
    act(() => result.current.calibration.onNudge("x", 0.5));
    act(() => result.current.calibration.onYaw(0.8));
    act(() => result.current.calibration.onSave());
    expect(list.update).toHaveBeenCalledWith(1, {
      position: { x: 1.5, y: 0, z: 2 },
      yawOffset: 0.8,
    });
  });

  it("renders the draft over the panorama while the alignment is open", () => {
    const { result } = mount(modeStub({ editingPanoramaId: 1 }));
    expect(result.current.calibration.effective).toBeNull();
    act(() => result.current.calibration.onStart());
    act(() => result.current.calibration.onYaw(0.8));
    expect(result.current.calibration.active).toBe(true);
    expect(result.current.calibration.effective?.yawOffset).toBe(0.8);
  });

  it("saves the anchor card's whole patch against the panorama it is open on", () => {
    const { result } = mount(modeStub({ editingPanoramaId: 2 }));
    const patch = {
      title: "Control room",
      position: { x: 3, y: 1, z: 0 },
      yawOffset: 0,
      defaultYaw: 1,
    };
    act(() => result.current.onSave(patch));
    expect(list.update).toHaveBeenCalledWith(2, patch);
  });

  it("closes the card it just deleted the subject of", () => {
    const mode = modeStub({ editingPanoramaId: 2 });
    const { result } = mount(mode);
    act(() => result.current.onDelete());
    expect(list.remove).toHaveBeenCalledWith(2);
    expect(mode.closeEdit).toHaveBeenCalled();
  });

  it("leaves a panorama the reader is standing in when it is deleted", () => {
    // The sphere and the rig unmount by themselves (the lookup finds nothing),
    // but the reducer's view stayed { kind: "panorama" }: the header pill, the
    // rail and the footer all kept describing a capture that no longer exists,
    // over a 3D scene, until the reader pressed Escape.
    const mode = modeStub({ view: { kind: "panorama", id: 2 }, editingPanoramaId: 2 });
    const { result } = mount(mode);
    act(() => result.current.onDelete());
    expect(mode.exitPanorama).toHaveBeenCalled();
    expect(list.remove).toHaveBeenCalledWith(2);
  });

  it("stays in the panorama when a different capture's card is the one deleted", () => {
    const mode = modeStub({ view: { kind: "panorama", id: 1 }, editingPanoramaId: 2 });
    const { result } = mount(mode);
    act(() => result.current.onDelete());
    expect(mode.exitPanorama).not.toHaveBeenCalled();
    expect(list.remove).toHaveBeenCalledWith(2);
  });

  it("appends an uploaded capture and shuts the dialog behind it", () => {
    const { result } = mount();
    act(() => result.current.upload.onOpen());
    expect(result.current.upload.open).toBe(true);

    const created = panorama(9);
    act(() => usePanoramaUpload.mock.calls.at(-1)![0].onCreated(created as never));
    expect(list.add).toHaveBeenCalledWith(created);
    expect(result.current.upload.open).toBe(false);
  });

  it("keeps every canvas-bound callback stable across a re-render", () => {
    // `onMarkerDrop` and friends are props on a tree that mounts WebGL: a fresh
    // identity re-binds the drag controller's window listeners on every render
    // the page does, which is one per keystroke in the panel. The list hook
    // returns a new object each render, so the callbacks depend on its stable
    // members, never on the object.
    const mode = modeStub();
    const { result, rerender } = mount(mode);
    const first = result.current;
    // What the page really hands over on a re-render: a fresh wrapper object
    // around the same reducer callbacks.
    rerender({ mode: { ...mode }, moving: true });

    expect(result.current.drag.end).toBe(first.drag.end);
    expect(result.current.drag.begin).toBe(first.drag.begin);
    expect(result.current.drag.move).toBe(first.drag.move);
    expect(result.current.onEnter).toBe(first.onEnter);
    expect(result.current.onExit).toBe(first.onExit);
    expect(result.current.onSave).toBe(first.onSave);
  });

  it("hands the tour link the territory's own URL", () => {
    mount();
    expect(useTerritoryLink).toHaveBeenCalledWith("refinery-block-c", "https://tour.example");
  });
});
