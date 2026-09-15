import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useDocumentUpload } from "./use-document-upload";

const { createDocument, initiateUpload, appendChunk, finalizeUpload, abortUpload } = vi.hoisted(
  () => ({
    createDocument: vi.fn(),
    initiateUpload: vi.fn(),
    appendChunk: vi.fn(),
    finalizeUpload: vi.fn(),
    abortUpload: vi.fn(),
  }),
);

vi.mock("@/entities/document", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createDocument,
}));
vi.mock("@/entities/upload/api/upload-gateway", () => ({
  initiateUpload,
  appendChunk,
  finalizeUpload,
  abortUpload,
}));

const CREATED: Document = {
  id: 3,
  territorySlug: "refinery-block-c",
  title: "Fire safety zones",
  sourceBlobHash: "abc",
  createdAt: "2026-09-14T10:00:00Z",
};

const pdf = () =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0])], "plan-sheet-03.pdf", {
    type: "application/pdf",
  });

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], "photo.jpg");

let onCreated: ReturnType<typeof vi.fn<(document: Document) => void>>;

const mount = () =>
  renderHook(() => ({
    d: useDocumentUpload({ slug: "refinery-block-c", onCreated }),
    notices: useNotices(),
  }));

async function ready() {
  const view = mount();
  await act(async () => {
    await view.result.current.d.pick([pdf()]);
  });
  act(() => view.result.current.d.setTitle("  Fire safety zones  "));
  return view;
}

beforeEach(() => {
  createDocument.mockReset().mockResolvedValue(CREATED);
  initiateUpload.mockReset().mockResolvedValue({ id: "u1", size: 12, offset: 0 });
  appendChunk
    .mockReset()
    .mockImplementation((_id: string, offset: number, chunk: Blob) => offset + chunk.size);
  finalizeUpload.mockReset().mockResolvedValue({ hash: "abc", size: 12 });
  abortUpload.mockReset().mockResolvedValue(undefined);
  onCreated = vi.fn();
  clearNotices();
});

describe("useDocumentUpload", () => {
  it("starts idle with nothing to submit", () => {
    const { result } = mount();
    expect(result.current.d.upload).toEqual({ stage: "idle", file: null });
    expect(result.current.d.canSubmit).toBe(false);
  });

  it("refuses a file that is not a PDF", async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.d.pick([jpeg()]);
    });

    expect(result.current.d.upload).toEqual({
      stage: "refused",
      file: null,
      reason: "Please choose a PDF file.",
    });
  });

  it("needs both a picked PDF and a non-blank title", async () => {
    const { result } = mount();
    act(() => result.current.d.setTitle("  "));
    await act(async () => {
      await result.current.d.pick([pdf()]);
    });
    expect(result.current.d.canSubmit).toBe(false);

    act(() => result.current.d.setTitle("Fire safety zones"));
    expect(result.current.d.canSubmit).toBe(true);
  });

  it("posts the trimmed title with the finalized hash, then hands the row back", async () => {
    const { result } = await ready();

    await act(async () => {
      await result.current.d.submit();
    });

    expect(createDocument).toHaveBeenCalledWith("refinery-block-c", {
      title: "Fire safety zones",
      sourceBlobHash: "abc",
    });
    expect(result.current.notices[0]).toMatchObject({ tone: "success", message: "Document uploaded" });
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(result.current.d.upload).toEqual({ stage: "idle", file: null });
  });

  it("says plainly that bytes are travelling — a PDF has no EXIF to read", async () => {
    let releaseChunk!: (offset: number) => void;
    appendChunk.mockImplementation(
      () => new Promise<number>((resolve) => (releaseChunk = resolve)),
    );
    const { result } = await ready();

    act(() => void result.current.d.submit());
    await waitFor(() => expect(result.current.d.upload.stage).toBe("uploading"));

    await act(async () => releaseChunk(3));
    expect(result.current.d.upload).toMatchObject({
      stage: "uploading",
      percent: 25,
      label: "Uploading · 25 %",
    });
  });

  it("submits nothing while the title is blank", async () => {
    const view = mount();
    await act(async () => {
      await view.result.current.d.pick([pdf()]);
    });

    await act(async () => {
      await view.result.current.d.submit();
    });

    expect(createDocument).not.toHaveBeenCalled();
  });

  it("clear() drops the picked PDF", async () => {
    const { result } = await ready();
    act(() => result.current.d.clear());
    expect(result.current.d.upload).toEqual({ stage: "idle", file: null });
  });
});
