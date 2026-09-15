import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Panorama, SourceBbox } from "@/entities/panorama";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { usePanoramaUpload } from "./use-panorama-upload";

const { createPanorama, exifScenePosition, initiateUpload, appendChunk, finalizeUpload, abortUpload } =
  vi.hoisted(() => ({
    createPanorama: vi.fn(),
    exifScenePosition: vi.fn(),
    initiateUpload: vi.fn(),
    appendChunk: vi.fn(),
    finalizeUpload: vi.fn(),
    abortUpload: vi.fn(),
  }));

vi.mock("@/entities/panorama", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPanorama,
  exifScenePosition,
}));
// The upload runs for real over a stubbed gateway — the sniff, the chunk loop
// and the label are the hook's own wiring, and a faked useFileUpload would
// test the fake.
vi.mock("@/entities/upload/api/upload-gateway", () => ({
  initiateUpload,
  appendChunk,
  finalizeUpload,
  abortUpload,
}));

const BBOX: SourceBbox = { min: { x: 0, y: 0, z: -10 }, max: { x: 10, y: 5, z: 0 } };
const POSITION = { x: 1, y: 0, z: -2 };

const CREATED: Panorama = {
  id: 7,
  territorySlug: "refinery-block-c",
  slug: "pump-house-south",
  title: "Pump house, south wall",
  sourceBlobHash: "abc",
  position: POSITION,
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "2026-09-14T10:00:00Z",
};

const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1, 2, 3, 4])], "pump-house-south.jpg", {
    type: "image/jpeg",
  });

const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "sheet.pdf");

let onCreated: ReturnType<typeof vi.fn<(panorama: Panorama) => void>>;

const mount = (bbox: SourceBbox | null = BBOX) =>
  renderHook(() => ({
    p: usePanoramaUpload({ slug: "refinery-block-c", sourceBbox: bbox, onCreated }),
    notices: useNotices(),
  }));

/** Picks the photo and fills the title — the state every submit test starts from. */
async function ready(bbox: SourceBbox | null = BBOX) {
  const view = mount(bbox);
  await act(async () => {
    await view.result.current.p.pick([jpeg()]);
  });
  act(() => view.result.current.p.setTitle("  Pump house, south wall  "));
  return view;
}

beforeEach(() => {
  createPanorama.mockReset().mockResolvedValue(CREATED);
  exifScenePosition.mockReset().mockResolvedValue({ position: POSITION });
  initiateUpload.mockReset().mockResolvedValue({ id: "u1", size: 12, offset: 0 });
  appendChunk
    .mockReset()
    .mockImplementation((_id: string, _offset: number, chunk: Blob) => _offset + chunk.size);
  finalizeUpload.mockReset().mockResolvedValue({ hash: "abc", size: 12 });
  abortUpload.mockReset().mockResolvedValue(undefined);
  onCreated = vi.fn();
  clearNotices();
});

describe("usePanoramaUpload", () => {
  it("starts idle, with the GPS box ticked and nothing to submit", () => {
    const { result } = mount();
    expect(result.current.p.upload).toEqual({ stage: "idle", file: null });
    expect(result.current.p.useGps).toBe(true);
    expect(result.current.p.canSubmit).toBe(false);
  });

  it("refuses a file that is not an equirect image", async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.p.pick([pdf()]);
    });

    expect(result.current.p.upload).toEqual({
      stage: "refused",
      file: null,
      reason: "Please choose an equirectangular JPG or PNG image.",
    });
    expect(result.current.p.canSubmit).toBe(false);
  });

  it("needs both a picked photo and a non-blank title", async () => {
    const { result } = mount();
    act(() => result.current.p.setTitle("   "));
    await act(async () => {
      await result.current.p.pick([jpeg()]);
    });
    expect(result.current.p.canSubmit).toBe(false);

    act(() => result.current.p.setTitle("Pump house, south wall"));
    expect(result.current.p.canSubmit).toBe(true);
  });

  it("posts the trimmed title, the finalized hash and the EXIF position, then hands the row back", async () => {
    const { result } = await ready();

    await act(async () => {
      await result.current.p.submit();
    });

    expect(exifScenePosition).toHaveBeenCalledWith(expect.any(File), BBOX);
    expect(createPanorama).toHaveBeenCalledWith("refinery-block-c", {
      title: "Pump house, south wall",
      sourceBlobHash: "abc",
      position: POSITION,
      yawOffset: 0,
    });
    expect(result.current.notices[0]).toMatchObject({
      tone: "success",
      message: "Panorama placed from GPS",
    });
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(result.current.p.upload).toEqual({ stage: "idle", file: null });
  });

  it("says the photo's location misses this territory, and posts no position", async () => {
    exifScenePosition.mockResolvedValue({ position: null, reason: "outside" });
    const { result } = await ready();

    await act(async () => {
      await result.current.p.submit();
    });

    expect(createPanorama).toHaveBeenCalledWith("refinery-block-c", {
      title: "Pump house, south wall",
      sourceBlobHash: "abc",
      yawOffset: 0,
    });
    expect(result.current.notices[0]).toMatchObject({
      tone: "success",
      message: "Photo location doesn't match this territory — set position manually",
    });
  });

  it("asks for the position by hand when the photo carries no GPS", async () => {
    exifScenePosition.mockResolvedValue({ position: null, reason: "no-gps" });
    const { result } = await ready();

    await act(async () => {
      await result.current.p.submit();
    });

    expect(result.current.notices[0]).toMatchObject({
      tone: "success",
      message: "Panorama uploaded — set its position manually",
    });
  });

  it("never reads the photo's EXIF with the GPS box unticked", async () => {
    const { result } = await ready();
    act(() => result.current.p.setUseGps(false));

    await act(async () => {
      await result.current.p.submit();
    });

    expect(exifScenePosition).not.toHaveBeenCalled();
    expect(createPanorama).toHaveBeenCalledWith("refinery-block-c", {
      title: "Pump house, south wall",
      sourceBlobHash: "abc",
      yawOffset: 0,
    });
    expect(result.current.notices[0]).toMatchObject({
      message: "Panorama uploaded — set its position manually",
    });
  });

  it("calls EXIF for nothing when the territory has no bounding box to map onto", async () => {
    exifScenePosition.mockResolvedValue({ position: null, reason: "no-gps" });
    const { result } = await ready(null);

    await act(async () => {
      await result.current.p.submit();
    });

    expect(exifScenePosition).toHaveBeenCalledWith(expect.any(File), null);
  });

  it("reads EXIF in the upload line, because that is what this file's bytes are for", async () => {
    let releaseChunk!: (offset: number) => void;
    appendChunk.mockImplementation(
      () => new Promise<number>((resolve) => (releaseChunk = resolve)),
    );
    const { result } = await ready();

    act(() => void result.current.p.submit());
    await waitFor(() => expect(result.current.p.upload.stage).toBe("uploading"));

    await act(async () => releaseChunk(6));
    expect(result.current.p.upload).toMatchObject({
      stage: "uploading",
      percent: 50,
      label: "Reading EXIF · 50 %",
    });
  });

  it("clear() drops the picked photo", async () => {
    const { result } = await ready();
    act(() => result.current.p.clear());
    expect(result.current.p.upload).toEqual({ stage: "idle", file: null });
  });

  it("submits nothing while the title is blank", async () => {
    const view = mount();
    await act(async () => {
      await view.result.current.p.pick([jpeg()]);
    });

    await act(async () => {
      await view.result.current.p.submit();
    });

    expect(createPanorama).not.toHaveBeenCalled();
  });
});
