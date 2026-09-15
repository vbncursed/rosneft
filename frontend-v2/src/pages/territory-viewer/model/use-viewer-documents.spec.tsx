import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import { useViewerDocuments } from "./use-viewer-documents";

const { list, useDocumentList, useDocumentUpload } = vi.hoisted(() => {
  const list = { documents: [] as unknown[], pendingId: null, add: vi.fn(), remove: vi.fn() };
  return {
    list,
    // A fresh object each render, exactly as the real hook returns one.
    useDocumentList: vi.fn(() => ({ ...list })),
    useDocumentUpload: vi.fn((params: { onCreated: (d: never) => void }) => ({
      params,
      canSubmit: false,
    })),
  };
});

// The list talks to the gateway and is stubbed; the window model and the pip
// geometry are pure and run for real.
vi.mock("@/features/document-view", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useDocumentList,
}));
vi.mock("@/features/document-upload", () => ({ useDocumentUpload }));

const doc = (id: number, title: string): Document => ({
  id,
  territorySlug: "refinery-block-c",
  title,
  sourceBlobHash: `d${id}`,
  createdAt: "2026-09-14T10:00:00Z",
});

const DOCUMENTS = [doc(7, "Fire plan.pdf"), doc(8, "Layout.pdf")];

const onChanged = vi.fn();
const onOpen = vi.fn();

/** Escape both answers and sets state, so the answer is read from inside `act`. */
const claim = (escape: () => boolean): boolean => {
  let claimed = false;
  act(() => {
    claimed = escape();
  });
  return claimed;
};

const mount = () =>
  renderHook(() =>
    useViewerDocuments({
      slug: "refinery-block-c",
      initial: DOCUMENTS,
      onChanged,
      onOpen,
    }),
  );

describe("useViewerDocuments", () => {
  beforeEach(() => {
    list.documents = DOCUMENTS;
    list.add.mockReset();
    list.remove.mockReset();
    onOpen.mockReset();
  });

  it("seeds the list from the bundle and reports what it holds", () => {
    const { result } = mount();
    expect(useDocumentList).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "refinery-block-c", initial: DOCUMENTS, onChanged }),
    );
    expect(result.current.list).toBe(DOCUMENTS);
  });

  it("opens a document as a pip, and leaves whatever was on screen first", () => {
    const { result } = mount();
    act(() => result.current.onOpen(7));
    expect(onOpen).toHaveBeenCalled();
    expect(result.current.active).toEqual(doc(7, "Fire plan.pdf"));
    expect(result.current.window).toBe("pip");
  });

  it("deletes the open document, and the window goes with the row", () => {
    const { result, rerender } = mount();
    act(() => result.current.onOpen(7));
    list.remove.mockImplementation(() => {
      list.documents = [DOCUMENTS[1]];
    });
    act(() => result.current.onDelete());
    expect(list.remove).toHaveBeenCalledWith(7);

    // `active` is a lookup against the live list, so the removed row closes
    // the window on the next render without an effect to do it.
    rerender();
    expect(result.current.active).toBeNull();
  });

  it("deletes nothing while nothing is open", () => {
    const { result } = mount();
    act(() => result.current.onDelete());
    expect(list.remove).not.toHaveBeenCalled();
  });

  it("steps an expanded window back to a pip on Escape, and closes a pip", () => {
    const { result } = mount();
    act(() => result.current.onOpen(7));
    act(() => result.current.onWindow("expanded"));

    expect(claim(result.current.escape)).toBe(true);
    expect(result.current.window).toBe("pip");
    expect(claim(result.current.escape)).toBe(true);
    expect(result.current.active).toBeNull();
  });

  it("leaves Escape to the rest of the viewer while no document is open", () => {
    const { result } = mount();
    expect(claim(result.current.escape)).toBe(false);
  });

  it("docks the window bottom-right of the viewport", () => {
    const { result } = mount();
    expect(result.current.pip.geo).toMatchObject({ w: 560, h: 400 });
    expect(result.current.pip.dragging).toBe(false);
  });

  it("keeps the window's callbacks stable across a re-render", () => {
    // The list hook hands back a new object every render; a callback that
    // depended on it would hand the PDF window a new `onDelete` each time.
    const { result, rerender } = mount();
    const first = result.current;
    rerender();
    expect(result.current.onDelete).toBe(first.onDelete);
    expect(result.current.onOpen).toBe(first.onOpen);
    expect(result.current.onWindow).toBe(first.onWindow);
  });

  it("appends an uploaded PDF and shuts the dialog behind it", () => {
    const { result } = mount();
    act(() => result.current.upload.onOpen());
    expect(result.current.upload.open).toBe(true);

    const created = doc(9, "Permit.pdf");
    act(() => useDocumentUpload.mock.calls.at(-1)![0].onCreated(created as never));
    expect(list.add).toHaveBeenCalledWith(created);
    expect(result.current.upload.open).toBe(false);
  });
});
